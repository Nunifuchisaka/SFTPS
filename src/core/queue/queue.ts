import { nextStatus, type TaskKind, type TransferTask } from './task';
import { nextRetryDelay, type RetryOptions } from './retry';
import { aggregateProgress, type OverallProgress, type TaskProgress } from './progress';

export interface RunContext {
  /** 協調キャンセル用シグナル。転送関数は可能なら監視して中断する。 */
  signal: AbortSignal;
  /** バイト進捗を報告する。 */
  reportProgress: (progress: TaskProgress) => void;
}

export interface TransferQueueOptions {
  /** 実際の転送処理（注入）。失敗時は reject する。 */
  runTask: (task: TransferTask, ctx: RunContext) => Promise<void>;
  retry: RetryOptions;
  /** 同時実行数（既定 1）。 */
  concurrency?: number;
  /** リトライ待機（注入。既定は setTimeout ベース）。 */
  delay?: (ms: number) => Promise<void>;
  /** タスク状態が変わるたびに通知。 */
  onUpdate?: (task: TransferTask) => void;
  /** タスク進捗の通知。 */
  onProgress?: (taskId: string, progress: TaskProgress) => void;
}

export interface AddTaskInput {
  id: string;
  kind: TaskKind;
  label?: string;
  payload?: unknown;
}

function realDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 転送タスクのキュー実行器。並行度・指数バックオフのリトライ・
 * 協調キャンセル・進捗通知を担う。実際の転送は runTask 注入で行う。
 */
export class TransferQueue {
  private readonly tasks: TransferTask[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private readonly progress = new Map<string, TaskProgress>();
  private readonly canceled = new Set<string>();
  private readonly concurrency: number;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(private readonly options: TransferQueueOptions) {
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.delay = options.delay ?? realDelay;
  }

  add(input: AddTaskInput): TransferTask {
    const task: TransferTask = {
      id: input.id,
      kind: input.kind,
      status: 'queued',
      attempts: 0,
      label: input.label,
      payload: input.payload,
    };
    this.tasks.push(task);
    return task;
  }

  list(): TransferTask[] {
    return this.tasks.map((t) => ({ ...t }));
  }

  overall(): OverallProgress {
    return aggregateProgress([...this.progress.values()]);
  }

  cancel(id: string): void {
    this.canceled.add(id);
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.status === 'queued') {
      this.setStatus(task, 'cancel');
    } else if (task.status === 'running' || task.status === 'retrying') {
      this.controllers.get(id)?.abort();
    }
  }

  cancelAll(): void {
    for (const task of this.tasks) {
      if (task.status !== 'succeeded' && task.status !== 'failed' && task.status !== 'canceled') {
        this.cancel(task.id);
      }
    }
  }

  async run(): Promise<void> {
    const pending = this.tasks.filter((t) => t.status === 'queued');
    let index = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const task = pending[index++];
        if (!task) return;
        await this.processTask(task);
      }
    };
    const workerCount = Math.min(this.concurrency, pending.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  private async processTask(task: TransferTask): Promise<void> {
    if (task.status === 'canceled' || this.canceled.has(task.id)) {
      if (task.status !== 'canceled') this.setStatus(task, 'cancel');
      return;
    }

    const controller = new AbortController();
    this.controllers.set(task.id, controller);

    for (;;) {
      this.setStatus(task, 'start');
      try {
        await this.options.runTask(task, {
          signal: controller.signal,
          reportProgress: (p) => this.reportProgress(task.id, p),
        });
        if (this.canceled.has(task.id)) {
          this.setStatus(task, 'cancel');
          return;
        }
        this.setStatus(task, 'succeed');
        return;
      } catch (err) {
        if (this.canceled.has(task.id)) {
          this.setStatus(task, 'cancel');
          return;
        }
        task.error = errorMessage(err);
        this.setStatus(task, 'fail');
        const wait = nextRetryDelay(task.attempts, this.options.retry);
        if (wait === null) return; // failed で確定
        this.setStatus(task, 'retry');
        await this.delay(wait);
        if (this.canceled.has(task.id)) {
          this.setStatus(task, 'cancel');
          return;
        }
        // ループして再実行
      }
    }
  }

  private setStatus(task: TransferTask, event: Parameters<typeof nextStatus>[1]): void {
    task.status = nextStatus(task.status, event);
    if (event === 'start') task.attempts++;
    this.options.onUpdate?.(task);
  }

  private reportProgress(id: string, progress: TaskProgress): void {
    this.progress.set(id, progress);
    this.options.onProgress?.(id, progress);
  }
}
