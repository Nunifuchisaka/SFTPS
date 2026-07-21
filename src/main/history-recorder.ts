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
    request.kind === 'sync'
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
