import { readFile } from 'node:fs/promises';
import type { RemoteTransport } from '../transport/types';
import type { BackupManager } from '../backup/index';
import { diffContent, isBinary, type DiffSegment, type DiffSummary } from '../diff/index';
import { verifyBuffers } from '../checksum/index';

export interface CommitOptions {
  /** true のとき、書き込み後に宛先を読み直してハッシュ比較する（不一致なら例外・追加 read コスト）。 */
  verifyAfterTransfer?: boolean;
}

export interface PreparePreviewOptions {
  /** 文字差分を行う上限バイト数（超過時はサイズ比較へフォールバック）。 */
  maxDiffBytes?: number;
}

export interface UploadPreview {
  localPath: string;
  remotePath: string;
  /** リモートに既存ファイルがない（新規アップロード）か。 */
  isNew: boolean;
  binary: boolean;
  /** サイズ上限超過のため文字差分を省略したか。 */
  tooLarge?: boolean;
  /** 省略の判断に使った上限バイト数（tooLarge のときのみ）。 */
  diffLimitBytes?: number;
  /** アップロード予定（ローカル）のバイト数。 */
  afterSize: number;
  /** リモート既存ファイルのバイト数。新規なら undefined。 */
  beforeSize?: number;
  /** テキスト差分セグメント。バイナリまたは新規なら undefined。 */
  segments?: DiffSegment[];
  /** テキスト差分サマリ。バイナリまたは新規なら undefined。 */
  summary?: DiffSummary;
}

export interface CommitResult {
  /** 取得したバックアップの絶対パス。新規で取得しなかった場合は null。 */
  backupPath: string | null;
  bytesWritten: number;
  /** verifyAfterTransfer 有効時に整合性検証が成功したか。 */
  verified?: boolean;
}

/**
 * アップロードのプレビューを作成する。
 * リモートに既存ファイルがあれば取得して差分を計算し、
 * バイナリならサイズ情報のみに落とす。
 */
export async function prepareUpload(
  transport: RemoteTransport,
  localPath: string,
  remotePath: string,
  options: PreparePreviewOptions = {},
): Promise<UploadPreview> {
  const localData = await readFile(localPath);

  if (!(await transport.exists(remotePath))) {
    return {
      localPath,
      remotePath,
      isNew: true,
      binary: isBinary(localData),
      afterSize: localData.length,
    };
  }

  const remoteData = await transport.readFile(remotePath);
  const result = diffContent(remoteData, localData, {
    ...(options.maxDiffBytes !== undefined ? { maxBytes: options.maxDiffBytes } : {}),
  });

  if (result.binary) {
    return {
      localPath,
      remotePath,
      isNew: false,
      binary: true,
      beforeSize: remoteData.length,
      afterSize: localData.length,
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
      beforeSize: remoteData.length,
      afterSize: localData.length,
    };
  }

  return {
    localPath,
    remotePath,
    isNew: false,
    binary: false,
    beforeSize: remoteData.length,
    afterSize: localData.length,
    segments: result.segments,
    summary: result.summary,
  };
}

/**
 * アップロードを確定する。既存リモートファイルをバックアップしてから上書きする。
 */
export async function commitUpload(
  transport: RemoteTransport,
  backupManager: BackupManager,
  profileId: string,
  localPath: string,
  remotePath: string,
  options: CommitOptions = {},
): Promise<CommitResult> {
  const backupPath = await backupManager.backupExisting(transport, profileId, remotePath);
  const data = await readFile(localPath);
  await transport.writeFile(remotePath, data);

  const result: CommitResult = { backupPath, bytesWritten: data.length };
  if (options.verifyAfterTransfer) {
    const readBack = await transport.readFile(remotePath);
    if (!verifyBuffers(data, readBack).ok) {
      throw new Error(`integrity check failed after upload: ${remotePath}`);
    }
    result.verified = true;
  }
  return result;
}
