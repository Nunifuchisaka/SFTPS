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
        return {
          result: { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [], canceled: false },
          summary: { upload: 0, createDir: 0, skip: 0, deleteExtra: 0 },
        };
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

  it('forwards the queue abort signal to every service call', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const service: QueueableService = {
      commitUpload: async (_id, _local, _remote, _options, signal) => {
        signals.push(signal);
        return { backupPath: null, bytesWritten: 0 };
      },
      download: async (_id, _remote, _save, signal) => {
        signals.push(signal);
        return { bytesWritten: 0 };
      },
      commitSync: async (_id, _localDir, _remoteDir, _options, signal) => {
        signals.push(signal);
        return {
          result: { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [], canceled: false },
          summary: { upload: 0, createDir: 0, skip: 0, deleteExtra: 0 },
        };
      },
    };

    const q = createAppTransferQueue(service, { retry: noRetry, concurrency: 1 });
    q.add({ id: '1', kind: 'upload', payload: { kind: 'upload', profileId: 'p', localPath: '/l', remotePath: '/r' } });
    q.add({ id: '2', kind: 'download', payload: { kind: 'download', profileId: 'p', remotePath: '/r', savePath: '/s' } });
    q.add({ id: '3', kind: 'sync', payload: { kind: 'sync', profileId: 'p', localDir: '/ld', remoteDir: '/rd' } });
    await q.run();

    expect(signals).toHaveLength(3);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it('aborts the signal of a running task when it is canceled', async () => {
    let observed: AbortSignal | undefined;
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = {
      commitUpload: async (_id: string, _l: string, _r: string, _o?: unknown, signal?: AbortSignal) => {
        observed = signal;
        release?.();
        await new Promise((r) => setTimeout(r, 5));
        return { backupPath: null, bytesWritten: 0 };
      },
      download: async () => ({ bytesWritten: 0 }),
      commitSync: async () => {
        throw new Error('not used');
      },
    } as unknown as QueueableService;

    const q = createAppTransferQueue(service, { retry: noRetry, concurrency: 1 });
    q.add({ id: '1', kind: 'upload', payload: { kind: 'upload', profileId: 'p', localPath: '/l', remotePath: '/r' } });
    const running = q.run();
    await started;
    q.cancel('1');
    await running;

    expect(observed?.aborted).toBe(true);
    expect(q.list()[0].status).toBe('canceled');
  });
});
