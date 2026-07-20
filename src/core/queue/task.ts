export type TaskKind = 'upload' | 'download' | 'sync';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'canceled';

export type TaskEvent = 'start' | 'succeed' | 'fail' | 'retry' | 'cancel';

export interface TransferTask {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  /** これまでに開始した実行回数。 */
  attempts: number;
  label?: string;
  /** 実際の転送に必要なアプリ固有情報（キューには不透明）。 */
  payload?: unknown;
  /** 最後のエラーメッセージ（失敗時）。 */
  error?: string;
}

const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskEvent, TaskStatus>>> = {
  queued: { start: 'running', cancel: 'canceled' },
  running: { succeed: 'succeeded', fail: 'failed', cancel: 'canceled' },
  retrying: { start: 'running', cancel: 'canceled' },
  failed: { retry: 'retrying' },
  succeeded: {},
  canceled: {},
};

/** タスク状態遷移の純粋関数。不正な遷移は例外を投げる。 */
export function nextStatus(current: TaskStatus, event: TaskEvent): TaskStatus {
  const next = TRANSITIONS[current][event];
  if (next === undefined) {
    throw new Error(`invalid transition: ${current} --${event}-->`);
  }
  return next;
}
