export interface TaskProgress {
  transferred: number;
  total: number;
}

export interface OverallProgress {
  transferred: number;
  total: number;
  /** 0..1 の全体進捗率（total が 0 のときは 0）。 */
  ratio: number;
}

/** 複数タスクの進捗を合計し全体進捗率を求める純粋関数。 */
export function aggregateProgress(progresses: TaskProgress[]): OverallProgress {
  let transferred = 0;
  let total = 0;
  for (const p of progresses) {
    transferred += p.transferred;
    total += p.total;
  }
  return { transferred, total, ratio: total > 0 ? transferred / total : 0 };
}
