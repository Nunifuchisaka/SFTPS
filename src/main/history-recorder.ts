import type { TransferTask } from '../core/queue/index';
import type { HistoryInput } from '../core/history/index';
import type { TransferRequest } from '../shared/ipc';

/**
 * 終端状態（succeeded/failed）の転送タスクを履歴入力へ変換する純粋関数。
 * 非終端タスクは null。シークレットは payload に含まれないため安全。
 */
export function taskToHistoryInput(task: TransferTask): HistoryInput | null {
  if (task.status !== 'succeeded' && task.status !== 'failed') return null;

  const request = task.payload as TransferRequest;
  const path =
    request.kind === 'sync' || request.kind === 'download-sync'
      ? request.remoteDir
      : request.remotePath;

  const input: HistoryInput = {
    id: task.id,
    kind: request.kind,
    profileId: request.profileId,
    path,
    status: task.status === 'succeeded' ? 'success' : 'failed',
  };
  if (task.status === 'failed' && task.error !== undefined) {
    input.error = task.error;
  }
  return input;
}

/**
 * 終端タスクを id で重複排除しつつ履歴へ一度だけ記録する。
 * 記録済み id 集合はキューに残っているタスクへ sweep で追随させ、単調増加させない。
 */
export class TerminalTaskRecorder {
  private readonly recorded = new Set<string>();

  constructor(private readonly append: (input: HistoryInput) => void) {}

  /** 記録済み id の件数（テスト・診断用）。 */
  get recordedCount(): number {
    return this.recorded.size;
  }

  /** 未記録の終端タスクを履歴へ追加し、今回記録した件数を返す。 */
  record(tasks: readonly TransferTask[]): number {
    let count = 0;
    for (const task of tasks) {
      if (this.recorded.has(task.id)) continue;
      const input = taskToHistoryInput(task);
      if (!input) continue;
      this.recorded.add(task.id);
      this.append(input);
      count++;
    }
    return count;
  }

  /** 現存するタスク id 以外を記録済み集合から落とす（キューの保持上限と連動させる）。 */
  sweep(liveIds: Iterable<string>): void {
    const live = new Set(liveIds);
    for (const id of this.recorded) {
      if (!live.has(id)) this.recorded.delete(id);
    }
  }
}
