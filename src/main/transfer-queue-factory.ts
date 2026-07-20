import {
  TransferQueue,
  type RetryOptions,
  type TransferTask,
} from '../core/queue/index';
import type {
  CommitResult,
} from '../core/upload/index';
import type { CommitSyncResult, SyncFolderOptions, TransferRequest } from '../shared/ipc';

/** キューが依存する AppService のメソッド（構造的サブセット）。 */
export interface QueueableService {
  commitUpload(id: string, localPath: string, remotePath: string): Promise<CommitResult>;
  download(id: string, remotePath: string, savePath: string): Promise<{ bytesWritten: number }>;
  commitSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options?: SyncFolderOptions,
  ): Promise<CommitSyncResult>;
}

export interface AppTransferQueueOptions {
  retry?: RetryOptions;
  concurrency?: number;
  onUpdate?: (task: TransferTask) => void;
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
    runTask: async (task: TransferTask): Promise<void> => {
      const request = task.payload as TransferRequest;
      switch (request.kind) {
        case 'upload':
          await service.commitUpload(request.profileId, request.localPath, request.remotePath);
          break;
        case 'download':
          await service.download(request.profileId, request.remotePath, request.savePath);
          break;
        case 'sync':
          await service.commitSync(
            request.profileId,
            request.localDir,
            request.remoteDir,
            request.options,
          );
          break;
      }
    },
    ...(options.onUpdate ? { onUpdate: options.onUpdate } : {}),
  };
  return new TransferQueue(queueOptions);
}
