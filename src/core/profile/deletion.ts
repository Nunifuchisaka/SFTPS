import { isValidProfileId, type Profile } from './index';
import type { KnownHostEntry } from '../hostkey/known-hosts';

/** 削除対象になりうるホスト鍵の指定（指紋は問わない）。 */
export interface KnownHostRef {
  host: string;
  port: number;
}

export interface ProfileDeletionOptions {
  /** 現在保存されている全プロファイル（削除対象を含む）。 */
  profiles: readonly Profile[];
  /** 信頼済みホスト鍵の一覧（未指定なら空）。 */
  knownHosts?: readonly KnownHostEntry[];
  /** ブックマーク・履歴・ホスト鍵も削除するか（ユーザーの明示同意）。 */
  removeRelatedData?: boolean;
  /** バックアップ（復旧手段）も削除するか（ユーザーの明示同意）。 */
  removeBackups?: boolean;
}

export interface ProfileDeletionPlan {
  profileId: string;
  /** シークレットは常に削除する（プロファイルが消えれば参照されない）。 */
  removeSecrets: true;
  removeBookmarks: boolean;
  removeHistory: boolean;
  /** 削除してよいホスト鍵（他のプロファイルが使っているものは含めない）。 */
  removeKnownHosts: KnownHostRef[];
  /** 削除してよいバックアップ名前空間（アップロード用・ダウンロード用）。 */
  backupNamespaces: string[];
}

/** そのプロファイルがホスト鍵検証の対象か（SFTP のみ known_hosts に載る）。 */
function hostKeyRefOf(profile: Profile): KnownHostRef | null {
  return profile.protocol === 'sftp' ? { host: profile.host, port: profile.port } : null;
}

function sameHost(a: KnownHostRef, b: KnownHostRef): boolean {
  return a.host === b.host && a.port === b.port;
}

/**
 * プロファイル削除に伴って消すべきデータを決める純粋関数。
 *
 * プロファイル本体とシークレットは常に対象。ブックマーク・履歴・ホスト鍵は
 * 「関連データも削除する」に同意した場合のみ対象とし、他のプロファイルがまだ
 * 使っているホスト鍵は残す。バックアップは復旧手段でもあるため、さらに別の
 * 明示同意（removeBackups）がある場合にのみ対象とする。
 */
export function planProfileDeletion(
  profileId: string,
  options: ProfileDeletionOptions,
): ProfileDeletionPlan {
  if (!isValidProfileId(profileId)) {
    throw new Error(`invalid profile id: ${profileId}`);
  }

  const related = options.removeRelatedData === true;
  const target = options.profiles.find((p) => p.id === profileId) ?? null;
  const targetHost = target ? hostKeyRefOf(target) : null;

  const stillUsed = options.profiles
    .filter((p) => p.id !== profileId)
    .map(hostKeyRefOf)
    .filter((ref): ref is KnownHostRef => ref !== null);

  const removeKnownHosts =
    related && targetHost && !stillUsed.some((ref) => sameHost(ref, targetHost))
      ? (options.knownHosts ?? [])
          .filter((entry) => sameHost(entry, targetHost))
          .map((entry) => ({ host: entry.host, port: entry.port }))
      : [];

  return {
    profileId,
    removeSecrets: true,
    removeBookmarks: related,
    removeHistory: related,
    removeKnownHosts,
    backupNamespaces:
      options.removeBackups === true ? [profileId, `${profileId}/download`] : [],
  };
}
