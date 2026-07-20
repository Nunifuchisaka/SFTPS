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
}

export interface RunSyncResult {
  uploaded: number;
  createdDirs: number;
  skipped: number;
  deleted: number;
  /** 取得したバックアップの絶対パス一覧。 */
  backups: string[];
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
  const result: RunSyncResult = { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [] };

  for (const action of plan) {
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
      case 'delete-extra':
        await dest.delete(dstPath);
        result.deleted++;
        break;
      case 'skip':
        result.skipped++;
        break;
    }
  }

  return result;
}
