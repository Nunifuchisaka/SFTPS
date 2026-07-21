import type { TaskStatus } from './task';

/** これ以上状態が動かない（＝保持し続ける必要がない）タスク状態。 */
const TERMINAL: readonly TaskStatus[] = ['succeeded', 'failed', 'canceled'];

/** タスクが終端状態（成功・失敗・キャンセル）か判定する純粋関数。 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL.includes(status);
}

export interface TaskRetentionPlan<T> {
  /** 保持するタスク（入力の順序を保つ）。 */
  keep: T[];
  /** 破棄するタスクの id。 */
  removedIds: string[];
}

/**
 * 終端タスクの保持件数を上限で打ち切る計画を立てる純粋関数。
 * 未終端（queued/running/retrying）は駆動対象なので常に保持し、
 * 終端タスクは新しい方から maxCompleted 件だけ残す（0 以下なら全破棄＝完了分クリア）。
 */
export function planTaskRetention<T extends { id: string; status: TaskStatus }>(
  tasks: readonly T[],
  maxCompleted: number,
): TaskRetentionPlan<T> {
  const limit = Math.max(0, maxCompleted);
  const terminalCount = tasks.reduce((n, t) => (isTerminalStatus(t.status) ? n + 1 : n), 0);
  let dropCount = terminalCount - limit;

  const keep: T[] = [];
  const removedIds: string[] = [];
  for (const task of tasks) {
    if (dropCount > 0 && isTerminalStatus(task.status)) {
      dropCount--;
      removedIds.push(task.id);
    } else {
      keep.push(task);
    }
  }
  return { keep, removedIds };
}
