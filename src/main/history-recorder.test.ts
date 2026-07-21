import { describe, it, expect } from 'vitest';
import type { TransferTask } from '../core/queue/index';
import type { TransferRequest } from '../shared/ipc';
import { taskToHistoryInput } from './history-recorder';

function task(over: Partial<TransferTask> & { payload: TransferRequest }): TransferTask {
  return { id: 't1', kind: 'upload', status: 'succeeded', attempts: 1, ...over };
}

describe('taskToHistoryInput', () => {
  it('maps a succeeded upload task', () => {
    const input = taskToHistoryInput(
      task({
        id: 'u1',
        kind: 'upload',
        status: 'succeeded',
        payload: { kind: 'upload', profileId: 'p1', localPath: '/l/a.txt', remotePath: '/pub/a.txt' },
      }),
    );
    expect(input).toEqual({ id: 'u1', kind: 'upload', profileId: 'p1', path: '/pub/a.txt', status: 'success' });
  });

  it('maps a failed download task with the error summary', () => {
    const input = taskToHistoryInput(
      task({
        id: 'd1',
        kind: 'download',
        status: 'failed',
        error: 'connection refused',
        payload: { kind: 'download', profileId: 'p1', remotePath: '/r/x', savePath: '/s/x' },
      }),
    );
    expect(input).toEqual({
      id: 'd1',
      kind: 'download',
      profileId: 'p1',
      path: '/r/x',
      status: 'failed',
      error: 'connection refused',
    });
  });

  it('uses the remote dir as the path for sync tasks', () => {
    const input = taskToHistoryInput(
      task({
        kind: 'sync',
        status: 'succeeded',
        payload: { kind: 'sync', profileId: 'p1', localDir: '/l', remoteDir: '/pub/site' },
      }),
    );
    expect(input?.path).toBe('/pub/site');
    expect(input?.kind).toBe('sync');
  });

  it('returns null for non-terminal tasks', () => {
    expect(
      taskToHistoryInput(
        task({ status: 'running', payload: { kind: 'upload', profileId: 'p', localPath: '/a', remotePath: '/b' } }),
      ),
    ).toBeNull();
  });
});
