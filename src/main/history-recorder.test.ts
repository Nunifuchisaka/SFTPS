import { describe, it, expect } from 'vitest';
import type { TransferTask } from '../core/queue/index';
import type { HistoryInput } from '../core/history/index';
import type { TransferRequest } from '../shared/ipc';
import { taskToHistoryInput, TerminalTaskRecorder } from './history-recorder';

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

  it('uses the remote dir as the path for download-sync tasks', () => {
    const input = taskToHistoryInput(
      task({
        kind: 'download-sync',
        status: 'succeeded',
        payload: { kind: 'download-sync', profileId: 'p1', remoteDir: '/pub/site', localDir: '/l' },
      }),
    );
    expect(input?.path).toBe('/pub/site');
    expect(input?.kind).toBe('download-sync');
  });

  it('returns null for non-terminal tasks', () => {
    expect(
      taskToHistoryInput(
        task({ status: 'running', payload: { kind: 'upload', profileId: 'p', localPath: '/a', remotePath: '/b' } }),
      ),
    ).toBeNull();
  });
});

describe('TerminalTaskRecorder', () => {
  function upload(id: string, status: TransferTask['status']): TransferTask {
    return task({
      id,
      status,
      payload: { kind: 'upload', profileId: 'p1', localPath: `/l/${id}`, remotePath: `/r/${id}` },
    });
  }

  function setup(): { appended: HistoryInput[]; recorder: TerminalTaskRecorder } {
    const appended: HistoryInput[] = [];
    return { appended, recorder: new TerminalTaskRecorder((input) => appended.push(input)) };
  }

  it('records each terminal task exactly once across repeated calls', () => {
    const { appended, recorder } = setup();
    const tasks = [upload('a', 'succeeded'), upload('b', 'failed')];
    expect(recorder.record(tasks)).toBe(2);
    expect(recorder.record(tasks)).toBe(0);
    expect(appended.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('skips tasks that have not reached a terminal state yet', () => {
    const { appended, recorder } = setup();
    recorder.record([upload('a', 'running'), upload('b', 'retrying'), upload('c', 'queued')]);
    expect(appended).toEqual([]);
    expect(recorder.recordedCount).toBe(0);
  });

  it('records a task that becomes terminal on a later call', () => {
    const { appended, recorder } = setup();
    recorder.record([upload('a', 'running')]);
    recorder.record([upload('a', 'succeeded')]);
    expect(appended.map((e) => e.id)).toEqual(['a']);
  });

  it('sweep drops ids that are no longer present so the dedup set stays bounded', () => {
    const { recorder } = setup();
    recorder.record([upload('a', 'succeeded'), upload('b', 'succeeded')]);
    expect(recorder.recordedCount).toBe(2);
    recorder.sweep(['b']);
    expect(recorder.recordedCount).toBe(1);
    recorder.sweep([]);
    expect(recorder.recordedCount).toBe(0);
  });

  it('keeps deduplicating the tasks that survive a sweep', () => {
    const { appended, recorder } = setup();
    const live = [upload('a', 'succeeded')];
    recorder.record(live);
    recorder.sweep(live.map((t) => t.id));
    recorder.record(live);
    expect(appended).toHaveLength(1);
  });
});
