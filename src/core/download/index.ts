import type { RemoteTransport } from '../transport/index';
import type { BackupManager } from '../backup/index';
import { diffContent, isBinary, type DiffSegment, type DiffSummary } from '../diff/index';

export interface DownloadPreview {
  localPath: string;
  remotePath: string;
  /** ローカルに既存ファイルがない（新規ダウンロード）か。 */
  isNew: boolean;
  binary: boolean;
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
  const result = diffContent(localData, remoteData); // before=local, after=remote

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
): Promise<DownloadResult> {
  const backupPath = await backupManager.backupExisting(local, downloadBackupKey(profileId), localPath);
  const data = await remote.readFile(remotePath);
  await local.writeFile(localPath, data);
  return { backupPath, bytesWritten: data.length };
}
