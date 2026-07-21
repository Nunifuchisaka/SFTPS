import type { RemoteTransport } from '../transport/index';
import { posixJoin } from '../transport/path-utils';
import type { BackupManager } from '../backup/index';
import type { SyncAction } from './types';

export interface RunSyncContext {
  backupManager: BackupManager;
  profileId: string;
  /** source 側の起点（既定 '/'）。 */
  sourceBase?: string;
  /** dest 側の起点（既定 '/'）。 */
  destBase?: string;
  /** 協調キャンセル用シグナル。各プラン項目の境界で中断判定する。 */
  signal?: AbortSignal;
}

export interface RunSyncResult {
  uploaded: number;
  createdDirs: number;
  skipped: number;
  deleted: number;
  /** 取得したバックアップの絶対パス一覧。 */
  backups: string[];
  /** キャンセル要求により未処理の項目を残して中断したか。 */
  canceled: boolean;
}

/**
 * 同期プランを source→dest に対して実行する。
 * upload 時は BackupManager で上書き前バックアップを取ってから書き込む
 * （commitUpload と同じ「上書き前バックアップ」方針を transport 間で再利用）。
 */
export async function runSync(
  source: RemoteTransport,
  dest: RemoteTransport,
  plan: SyncAction[],
  ctx: RunSyncContext,
): Promise<RunSyncResult> {
  const sourceBase = ctx.sourceBase ?? '/';
  const destBase = ctx.destBase ?? '/';
  const result: RunSyncResult = {
    uploaded: 0,
    createdDirs: 0,
    skipped: 0,
    deleted: 0,
    backups: [],
    canceled: false,
  };

  // 削除は最後・深い階層から実行する（親ディレクトリを先に消して
  // 配下ファイルのバックアップを取り損ねるのを防ぐ）。
  const deletions = plan
    .filter((a) => a.type === 'delete-extra')
    .sort((a, b) => depthOf(b.path) - depthOf(a.path));
  const others = plan.filter((a) => a.type !== 'delete-extra');

  for (const action of others) {
    if (ctx.signal?.aborted) {
      result.canceled = true;
      return result;
    }
    const srcPath = posixJoin(sourceBase, action.path);
    const dstPath = posixJoin(destBase, action.path);

    switch (action.type) {
      case 'create-dir':
        await dest.mkdir(dstPath);
        result.createdDirs++;
        break;
      case 'upload': {
        const data = await source.readFile(srcPath);
        const backupPath = await ctx.backupManager.backupExisting(dest, ctx.profileId, dstPath);
        if (backupPath) result.backups.push(backupPath);
        await dest.writeFile(dstPath, data);
        result.uploaded++;
        break;
      }
      case 'skip':
        result.skipped++;
        break;
    }
  }

  for (const action of deletions) {
    if (ctx.signal?.aborted) {
      result.canceled = true;
      return result;
    }
    const dstPath = posixJoin(destBase, action.path);
    if (action.entryType !== 'dir') {
      const backupPath = await ctx.backupManager.backupExisting(dest, ctx.profileId, dstPath);
      if (backupPath) result.backups.push(backupPath);
    }
    await dest.delete(dstPath);
    result.deleted++;
  }

  return result;
}

/** posix 相対パスの階層の深さ。 */
function depthOf(relPath: string): number {
  return relPath.split('/').filter(Boolean).length;
}
