import type { CompareBy, PlanOptions, SyncAction, SyncEntry } from './types';

function isSourceNewer(source: SyncEntry, dest: SyncEntry): boolean {
  if (source.modifiedAt === null || dest.modifiedAt === null) return false;
  return source.modifiedAt.getTime() > dest.modifiedAt.getTime();
}

/** ファイルが変更されているか（アップロード対象か）を判定し、理由を返す。 */
function fileVerdict(
  source: SyncEntry,
  dest: SyncEntry,
  compareBy: CompareBy,
): { upload: boolean; reason: string } {
  const sizeDiff = source.size !== dest.size;
  const newer = isSourceNewer(source, dest);

  if (compareBy === 'checksum') {
    if (source.hash !== undefined && dest.hash !== undefined) {
      return source.hash !== dest.hash
        ? { upload: true, reason: 'checksum changed' }
        : { upload: false, reason: 'unchanged' };
    }
    // ハッシュ未計算時はサイズ比較にフォールバック。
    return sizeDiff ? { upload: true, reason: 'size changed' } : { upload: false, reason: 'unchanged' };
  }
  if (compareBy === 'size') {
    return sizeDiff ? { upload: true, reason: 'size changed' } : { upload: false, reason: 'unchanged' };
  }
  if (compareBy === 'mtime') {
    return newer ? { upload: true, reason: 'newer' } : { upload: false, reason: 'unchanged' };
  }
  // size-and-mtime
  if (sizeDiff) return { upload: true, reason: 'size changed' };
  if (newer) return { upload: true, reason: 'newer' };
  return { upload: false, reason: 'unchanged' };
}

/**
 * source/dest のエントリ集合から同期アクションを算出する純粋関数。
 * delete-extra は deleteExtraneous=true のときのみ含める（既定は安全側でオフ）。
 */
export function planSync(
  sourceEntries: SyncEntry[],
  destEntries: SyncEntry[],
  options: PlanOptions = {},
): SyncAction[] {
  const compareBy: CompareBy = options.compareBy ?? 'size-and-mtime';
  const destMap = new Map(destEntries.map((e) => [e.path, e]));
  const sourcePaths = new Set(sourceEntries.map((e) => e.path));
  const actions: SyncAction[] = [];

  for (const source of sourceEntries) {
    const dest = destMap.get(source.path);
    if (source.type === 'dir') {
      if (dest && dest.type === 'dir') {
        actions.push({ type: 'skip', path: source.path, reason: 'dir exists' });
      } else {
        actions.push({ type: 'create-dir', path: source.path, reason: 'missing dir' });
      }
      continue;
    }
    if (!dest || dest.type !== 'file') {
      actions.push({ type: 'upload', path: source.path, reason: 'new' });
      continue;
    }
    const verdict = fileVerdict(source, dest, compareBy);
    actions.push({
      type: verdict.upload ? 'upload' : 'skip',
      path: source.path,
      reason: verdict.reason,
    });
  }

  if (options.deleteExtraneous) {
    for (const dest of destEntries) {
      if (!sourcePaths.has(dest.path)) {
        actions.push({
          type: 'delete-extra',
          path: dest.path,
          reason: 'extraneous',
          entryType: dest.type,
        });
      }
    }
  }

  return actions;
}

export interface PlanSummary {
  upload: number;
  createDir: number;
  skip: number;
  deleteExtra: number;
}

/** プランをアクション種別ごとに集計する。 */
export function summarizePlan(plan: SyncAction[]): PlanSummary {
  const summary: PlanSummary = { upload: 0, createDir: 0, skip: 0, deleteExtra: 0 };
  for (const action of plan) {
    if (action.type === 'upload') summary.upload++;
    else if (action.type === 'create-dir') summary.createDir++;
    else if (action.type === 'skip') summary.skip++;
    else summary.deleteExtra++;
  }
  return summary;
}
