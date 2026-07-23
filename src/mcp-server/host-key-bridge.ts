import type { HostKeyPromptRequest } from '../core/hostkey/index';
import { classifyConnectionError } from '../core/reconnect/index';
import type { Profile } from '../core/profile/index';
import type { ConnectionResult } from '../shared/ipc';
import { HostKeyTrustRequiredError } from './errors';

function keyOf(host: string, port: number): string {
  return `${host}:${port}`;
}

/**
 * ホスト鍵拒否イベント（bootstrap の onHostKeyRejected）を一時保持し、
 * withHostKeyErrorEnrichment / enrichConnectionResult が接続エラーを整形し直す際に
 * host:port で取り出せるようにする。MCP はダイアログを持たないため、
 * ここが唯一のフィンガープリント情報の受け渡し口になる。
 */
export class HostKeyRejectionTracker {
  private readonly pending = new Map<string, HostKeyPromptRequest>();

  /** bootstrap の onHostKeyRejected にそのまま渡すコールバック。verdict を問わず毎回記録する。 */
  readonly record = (request: HostKeyPromptRequest): void => {
    this.pending.set(keyOf(request.host, request.port), request);
  };

  /** 記録済みのレコードを取り出す（取り出したら消費し、次回のために残さない）。 */
  take(host: string, port: number): HostKeyPromptRequest | null {
    const key = keyOf(host, port);
    const request = this.pending.get(key);
    if (!request) return null;
    this.pending.delete(key);
    return request;
  }
}

export function createHostKeyRejectionTracker(): HostKeyRejectionTracker {
  return new HostKeyRejectionTracker();
}

/** ftp/sftp プロファイルの host:port を返す。該当しないプロトコル（s3）は null。 */
function hostPortOf(profile: Profile): { host: string; port: number } | null {
  return profile.protocol === 'ftp' || profile.protocol === 'sftp'
    ? { host: profile.host, port: profile.port }
    : null;
}

/** プロファイル一覧を読める最小の構造型（AppService のサブセット）。 */
export interface ProfileLookup {
  listProfiles(): Promise<Profile[]>;
}

/**
 * classifyConnectionError が 'hostkey' と判定したエラーについて、
 * 対応する拒否レコードを rejections から取り出し HostKeyTrustRequiredError を組み立てる。
 * 該当レコードがなければ null（元のエラーをそのまま使うべきという合図）。
 */
async function resolveHostKeyTrustRequiredError(
  service: ProfileLookup,
  profileId: string,
  rejections: HostKeyRejectionTracker,
): Promise<HostKeyTrustRequiredError | null> {
  const profiles = await service.listProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  const target = profile ? hostPortOf(profile) : null;
  const rejected = target ? rejections.take(target.host, target.port) : null;
  if (!rejected) return null;
  return new HostKeyTrustRequiredError(
    rejected.host,
    rejected.port,
    rejected.fingerprint,
    rejected.verdict,
    rejected.knownFingerprint,
  );
}

/**
 * 接続系ツール呼び出し（例外を投げる系: listRemote/prepareUpload/commitUpload 等）をラップし、
 * classifyConnectionError が 'hostkey' と判定したエラーを HostKeyTrustRequiredError へ整形し直す。
 * 対応するレコードが見つからなければ元のエラーをそのまま再送出する。
 */
export async function withHostKeyErrorEnrichment<T>(
  service: ProfileLookup,
  profileId: string,
  rejections: HostKeyRejectionTracker,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (classifyConnectionError(err) !== 'hostkey') throw err;
    const enriched = await resolveHostKeyTrustRequiredError(service, profileId, rejections);
    throw enriched ?? err;
  }
}

/**
 * test_connection は例外を投げず ConnectionResult（{ok:false, error}）を返す設計のため、
 * こちらは戻り値を見て整形し直す専用のヘルパー。
 */
export async function enrichConnectionResult(
  service: ProfileLookup,
  profileId: string,
  rejections: HostKeyRejectionTracker,
  result: ConnectionResult,
): Promise<ConnectionResult> {
  if (result.ok || !result.error) return result;
  if (classifyConnectionError(new Error(result.error)) !== 'hostkey') return result;
  const enriched = await resolveHostKeyTrustRequiredError(service, profileId, rejections);
  return enriched ? { ok: false, error: enriched.message } : result;
}
