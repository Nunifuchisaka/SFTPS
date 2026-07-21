import {
  TransferQueue,
  type RetryOptions,
  type RunContext,
  type TransferTask,
} from '../core/queue/index';
import type {
  CommitResult,
} from '../core/upload/index';
import type { CommitSyncResult, SyncFolderOptions, TransferRequest } from '../shared/ipc';

/** キューが依存する AppService のメソッド（構造的サブセット）。 */
export interface QueueableService {
  commitUpload(
    id: string,
    localPath: string,
    remotePath: string,
    options?: { verifyAfterTransfer?: boolean },
    signal?: AbortSignal,
  ): Promise<CommitResult>;
  download(
    id: string,
    remotePath: string,
    savePath: string,
    signal?: AbortSignal,
  ): Promise<{ bytesWritten: number }>;
  commitSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options?: SyncFolderOptions,
    signal?: AbortSignal,
  ): Promise<CommitSyncResult>;
}

export interface AppTransferQueueOptions {
  retry?: RetryOptions;
  concurrency?: number;
  onUpdate?: (task: TransferTask) => void;
  /** 保持上限を超えて破棄される完了タスク（破棄前に履歴へ残すため）。 */
  onEvict?: (tasks: TransferTask[]) => void;
  /** 保持する完了タスクの上限。 */
  maxCompletedTasks?: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  factor: 2,
  maxDelayMs: 30000,
};

/**
 * TransferQueue を AppService の転送操作へ結線するファクトリ。
 * task.payload（TransferRequest）を kind で判別して対応メソッドを呼ぶ。
 */
export function createAppTransferQueue(
  service: QueueableService,
  options: AppTransferQueueOptions = {},
): TransferQueue {
  const queueOptions = {
    retry: options.retry ?? DEFAULT_RETRY,
    concurrency: options.concurrency ?? 2,
    // ctx.signal を実行系へ渡し、各アクションの境界で中断できるようにする。
    runTask: async (task: TransferTask, ctx: RunContext): Promise<void> => {
      const request = task.payload as TransferRequest;
      switch (request.kind) {
        case 'upload':
          await service.commitUpload(
            request.profileId,
            request.localPath,
            request.remotePath,
            {},
            ctx.signal,
          );
          break;
        case 'download':
          await service.download(
            request.profileId,
            request.remotePath,
            request.savePath,
            ctx.signal,
          );
          break;
        case 'sync':
          await service.commitSync(
            request.profileId,
            request.localDir,
            request.remoteDir,
            request.options,
            ctx.signal,
          );
          break;
      }
    },
    ...(options.onUpdate ? { onUpdate: options.onUpdate } : {}),
    ...(options.onEvict ? { onEvict: options.onEvict } : {}),
    ...(options.maxCompletedTasks !== undefined
      ? { maxCompletedTasks: options.maxCompletedTasks }
      : {}),
  };
  return new TransferQueue(queueOptions);
}
