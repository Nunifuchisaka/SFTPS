import type { RemoteTransport } from '../transport/index';
import type { BackupManager } from '../backup/index';
import { diffContent, isBinary, type DiffSegment, type DiffSummary } from '../diff/index';
import { verifyBuffers } from '../checksum/index';
import type { PreparePreviewOptions } from '../upload/index';

export type { PreparePreviewOptions };

export interface DownloadCommitOptions {
  /** true のとき、書き込み後にローカルを読み直してハッシュ比較する（不一致なら例外）。 */
  verifyAfterTransfer?: boolean;
}

export interface DownloadPreview {
  localPath: string;
  remotePath: string;
  /** ローカルに既存ファイルがない（新規ダウンロード）か。 */
  isNew: boolean;
  binary: boolean;
  /** サイズ上限超過のため文字差分を省略したか。 */
  tooLarge?: boolean;
  /** 省略の判断に使った上限バイト数（tooLarge のときのみ）。 */
  diffLimitBytes?: number;
  /** ダウンロード予定（リモート）のバイト数。 */
  afterSize: number;
  /** 既存ローカルファイルのバイト数。新規なら undefined。 */
  beforeSize?: number;
  /** テキスト差分セグメント（before=既存ローカル, after=リモート新内容）。 */
  segments?: DiffSegment[];
  summary?: DiffSummary;
}

export interface DownloadResult {
  /** 取得したバックアップの絶対パス。新規で取得しなかった場合は null。 */
  backupPath: string | null;
  bytesWritten: number;
  /** verifyAfterTransfer 有効時に整合性検証が成功したか。 */
  verified?: boolean;
}

/**
 * ダウンロードのバックアップ名前空間キー。
 * アップロードは素の profileId を使うため、`<profileId>/download` に分けて衝突を防ぐ。
 */
export function downloadBackupKey(profileId: string): string {
  return `${profileId}/download`;
}

/**
 * ダウンロードのプレビューを作成する。
 * ローカルに既存ファイルがあれば「既存ローカル(before) vs リモート新内容(after)」の差分を返す。
 * バイナリならサイズ比較に落とす。ローカルに無ければ新規（差分なし）。
 */
export async function prepareDownload(
  remote: RemoteTransport,
  local: RemoteTransport,
  remotePath: string,
  localPath: string,
  options: PreparePreviewOptions = {},
): Promise<DownloadPreview> {
  const remoteData = await remote.readFile(remotePath);

  if (!(await local.exists(localPath))) {
    return {
      localPath,
      remotePath,
      isNew: true,
      binary: isBinary(remoteData),
      afterSize: remoteData.length,
    };
  }

  const localData = await local.readFile(localPath);
  // before=local, after=remote
  const result = diffContent(localData, remoteData, {
    ...(options.maxDiffBytes !== undefined ? { maxBytes: options.maxDiffBytes } : {}),
  });

  if (result.binary) {
    return {
      localPath,
      remotePath,
      isNew: false,
      binary: true,
      beforeSize: localData.length,
      afterSize: remoteData.length,
    };
  }

  if (result.tooLarge) {
    return {
      localPath,
      remotePath,
      isNew: false,
      binary: false,
      tooLarge: true,
      diffLimitBytes: result.limitBytes,
      beforeSize: localData.length,
      afterSize: remoteData.length,
    };
  }

  return {
    localPath,
    remotePath,
    isNew: false,
    binary: false,
    beforeSize: localData.length,
    afterSize: remoteData.length,
    segments: result.segments,
    summary: result.summary,
  };
}

/**
 * ダウンロードを確定する。既存ローカルファイルをバックアップしてから上書きする。
 */
export async function commitDownload(
  remote: RemoteTransport,
  local: RemoteTransport,
  backupManager: BackupManager,
  profileId: string,
  remotePath: string,
  localPath: string,
  options: DownloadCommitOptions = {},
): Promise<DownloadResult> {
  const backupPath = await backupManager.backupExisting(local, downloadBackupKey(profileId), localPath);
  const data = await remote.readFile(remotePath);
  await local.writeFile(localPath, data);

  const result: DownloadResult = { backupPath, bytesWritten: data.length };
  if (options.verifyAfterTransfer) {
    const readBack = await local.readFile(localPath);
    if (!verifyBuffers(data, readBack).ok) {
      throw new Error(`integrity check failed after download: ${localPath}`);
    }
    result.verified = true;
  }
  return result;
}
