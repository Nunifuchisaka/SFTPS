import { describe, it, expect } from 'vitest';
import { createAppTransferQueue, type QueueableService } from './transfer-queue-factory';
import type { RetryOptions } from '../core/queue/index';

const noRetry: RetryOptions = { maxAttempts: 1, baseDelayMs: 1, factor: 2, maxDelayMs: 10 };

describe('createAppTransferQueue', () => {
  it('dispatches each task kind to the matching service method', async () => {
    const calls: string[] = [];
    const service: QueueableService = {
      commitUpload: async (id, local, remote) => {
        calls.push(`upload ${id} ${local} ${remote}`);
        return { backupPath: null, bytesWritten: 0 };
      },
      download: async (id, remote, save) => {
        calls.push(`download ${id} ${remote} ${save}`);
        return { bytesWritten: 0 };
      },
      commitSync: async (id, localDir, remoteDir) => {
        calls.push(`sync ${id} ${localDir} ${remoteDir}`);
        return { result: { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [] }, summary: { upload: 0, createDir: 0, skip: 0, deleteExtra: 0 } };
      },
    };

    const q = createAppTransferQueue(service, { retry: noRetry, concurrency: 1 });
    q.add({ id: '1', kind: 'upload', payload: { kind: 'upload', profileId: 'p', localPath: '/l', remotePath: '/r' } });
    q.add({ id: '2', kind: 'download', payload: { kind: 'download', profileId: 'p', remotePath: '/r', savePath: '/s' } });
    q.add({ id: '3', kind: 'sync', payload: { kind: 'sync', profileId: 'p', localDir: '/ld', remoteDir: '/rd' } });
    await q.run();

    expect(calls).toEqual(['upload p /l /r', 'download p /r /s', 'sync p /ld /rd']);
    expect(q.list().every((t) => t.status === 'succeeded')).toBe(true);
  });
});
