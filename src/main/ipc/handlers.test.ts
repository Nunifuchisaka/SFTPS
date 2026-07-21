import { describe, it, expect } from 'vitest';
import { TransferQueue } from '../../core/queue/index';
import { HistoryStore, type HistoryEntry, type HistoryFilter } from '../../core/history/index';
import { DEFAULT_SETTINGS, type AppSettings } from '../../core/settings/index';
import { TerminalTaskRecorder } from '../history-recorder';
import { createIpcHandlers, type IpcHandlerDeps, type IpcService } from './handlers';

interface Recorded {
  name: string;
  args: unknown[];
}

function makeService(over: Partial<IpcService> = {}): { service: IpcService; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const rec =
    (name: string, value: unknown = undefined) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return Promise.resolve(value);
    };
  const base = {
    listProfiles: rec('listProfiles', []),
    saveProfile: rec('saveProfile', {}),
    deleteProfile: rec('deleteProfile', {
      removedBookmarks: 0,
      removedHistory: 0,
      removedKnownHosts: 0,
      purgedBackupNamespaces: 0,
    }),
    testConnection: rec('testConnection', { ok: true }),
    listRemote: rec('listRemote', []),
    prepareUpload: rec('prepareUpload', {}),
    commitUpload: rec('commitUpload', {}),
    prepareSync: rec('prepareSync', {}),
    commitSync: rec('commitSync', {}),
    prepareDownload: rec('prepareDownload', {}),
    download: rec('download', { bytesWritten: 1, backupPath: null }),
    renameRemote: rec('renameRemote'),
    deleteRemote: rec('deleteRemote'),
    chmodRemote: rec('chmodRemote'),
    listBookmarks: rec('listBookmarks', []),
    addBookmark: rec('addBookmark', {}),
    removeBookmark: rec('removeBookmark'),
    renameBookmark: rec('renameBookmark', {}),
    listBackups: rec('listBackups', []),
    restoreBackup: rec('restoreBackup', { bytesWritten: 0, backupPath: null }),
  } as unknown as IpcService;
  return { service: { ...base, ...over }, calls };
}

interface Harness {
  handlers: ReturnType<typeof createIpcHandlers>;
  queue: TransferQueue;
  history: HistoryStore;
  calls: Recorded[];
  settings: AppSettings;
  savedSettings: unknown[];
}

function makeHarness(options: {
  service?: Partial<IpcService>;
  runTask?: (id: string) => Promise<void>;
  maxCompletedTasks?: number;
} = {}): Harness {
  const { service, calls } = makeService(options.service ?? {});
  const history = new HistoryStore();
  const recorder = new TerminalTaskRecorder((input) => void history.append(input));
  const queue = new TransferQueue({
    runTask: async (task) => {
      await options.runTask?.(task.id);
    },
    retry: { maxAttempts: 1, baseDelayMs: 1, factor: 2, maxDelayMs: 1 },
    concurrency: 1,
    onEvict: (tasks) => void recorder.record(tasks),
    ...(options.maxCompletedTasks !== undefined
      ? { maxCompletedTasks: options.maxCompletedTasks }
      : {}),
  });

  let settings: AppSettings = DEFAULT_SETTINGS;
  const savedSettings: unknown[] = [];
  const deps: IpcHandlerDeps = {
    service,
    queue,
    recorder,
    history: {
      append: (input) => void history.append(input),
      list: (filter?: HistoryFilter): HistoryEntry[] => history.list(filter),
      clear: () => history.clear(),
    },
    knownHosts: { list: () => [], remove: async () => true },
    settings: {
      get: () => settings,
      save: async (input) => {
        savedSettings.push(input);
        settings = { ...DEFAULT_SETTINGS, diff: { maxBytes: 4096 } };
        return settings;
      },
    },
    listLocal: async () => [],
    isDirectory: async (p) => p.endsWith('/dir'),
    homeDir: () => '/home/u',
    isSecretStorageAvailable: () => true,
    pickFile: async () => null,
    pickDirectory: async () => null,
    pickSavePath: async () => null,
  };

  const harness: Harness = {
    handlers: createIpcHandlers(deps),
    queue,
    history,
    calls,
    settings,
    savedSettings,
  };
  return harness;
}

describe('transfer queue handlers', () => {
  it('enqueues a task, returns a unique id and drives it to completion', async () => {
    const h = makeHarness();
    const id1 = h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });
    const id2 = h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/b',
      remotePath: '/r/b',
    });
    expect(id1).not.toBe(id2);

    await h.handlers.whenIdle();
    expect(h.queue.list().every((t) => t.status === 'succeeded')).toBe(true);
  });

  it('drives a task enqueued while the queue is already running (no task left queued)', async () => {
    let second: string | null = null;
    const h = makeHarness({
      runTask: async (id) => {
        // 実行中に別のタスクが投入される状況（元実装ではこれが queued のまま残っていた）。
        if (second === null) {
          second = 'pending';
          second = h.handlers.enqueueTransfer({
            kind: 'download',
            profileId: 'p1',
            remotePath: '/r/late',
            savePath: '/l/late',
          });
        }
        expect(id).toBeTruthy();
      },
    });
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });

    await h.handlers.whenIdle();
    expect(h.queue.list()).toHaveLength(2);
    expect(h.queue.list().every((t) => t.status === 'succeeded')).toBe(true);
  });

  it('records each finished task in the history exactly once', async () => {
    const h = makeHarness();
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });
    await h.handlers.whenIdle();
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/b',
      remotePath: '/r/b',
    });
    await h.handlers.whenIdle();

    const entries = h.history.list();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.path).sort()).toEqual(['/r/a', '/r/b']);
  });

  it('records a failed task with its error summary', async () => {
    const h = makeHarness({
      runTask: async () => {
        throw new Error('connection refused');
      },
    });
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });
    await h.handlers.whenIdle();

    const entry = h.history.list()[0];
    expect(entry.status).toBe('failed');
    expect(entry.error).toBe('connection refused');
  });

  it('records evicted tasks before the queue drops them (retention must not lose history)', async () => {
    const h = makeHarness({ maxCompletedTasks: 1 });
    for (const n of ['a', 'b', 'c']) {
      h.handlers.enqueueTransfer({
        kind: 'upload',
        profileId: 'p1',
        localPath: `/l/${n}`,
        remotePath: `/r/${n}`,
      });
    }
    await h.handlers.whenIdle();

    expect(h.queue.list()).toHaveLength(1);
    expect(h.history.list().map((e) => e.path).sort()).toEqual(['/r/a', '/r/b', '/r/c']);
  });

  it('keeps the dedup set bounded by the queue retention', async () => {
    const h = makeHarness({ maxCompletedTasks: 1 });
    for (const n of ['a', 'b', 'c']) {
      h.handlers.enqueueTransfer({
        kind: 'upload',
        profileId: 'p1',
        localPath: `/l/${n}`,
        remotePath: `/r/${n}`,
      });
    }
    await h.handlers.whenIdle();
    expect(h.handlers.recordedTaskCount()).toBe(1);
  });

  it('queueStatus reports the retained tasks and the overall progress', async () => {
    const h = makeHarness();
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });
    await h.handlers.whenIdle();

    const status = h.handlers.queueStatus();
    expect(status.tasks).toHaveLength(1);
    expect(status.overall).toEqual({ transferred: 0, total: 0, ratio: 0 });
  });

  it('clearCompletedTasks empties the finished tasks', async () => {
    const h = makeHarness();
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });
    await h.handlers.whenIdle();
    expect(h.handlers.clearCompletedTasks()).toBe(1);
    expect(h.handlers.queueStatus().tasks).toEqual([]);
  });

  it('cancelAllTasks cancels the pending work', async () => {
    const h = makeHarness();
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/a',
      remotePath: '/r/a',
    });
    h.handlers.enqueueTransfer({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/l/b',
      remotePath: '/r/b',
    });
    h.handlers.cancelAllTasks();
    await h.handlers.whenIdle();
    expect(h.queue.list().every((t) => t.status === 'canceled')).toBe(true);
  });
});

describe('remote operation handlers', () => {
  it('records a successful rename in the history', async () => {
    const h = makeHarness();
    await h.handlers.renameRemote('p1', '/a.txt', '/b.txt');
    const entry = h.history.list()[0];
    expect(entry).toMatchObject({ kind: 'rename', profileId: 'p1', path: '/b.txt', status: 'success' });
  });

  it('records a failed rename with the source path and rethrows', async () => {
    const h = makeHarness({
      service: {
        renameRemote: async () => {
          throw new Error('permission denied');
        },
      },
    });
    await expect(h.handlers.renameRemote('p1', '/a.txt', '/b.txt')).rejects.toThrow(
      'permission denied',
    );
    const entry = h.history.list()[0];
    expect(entry).toMatchObject({ kind: 'rename', path: '/a.txt', status: 'failed' });
    expect(entry.error).toBe('permission denied');
  });

  it('records delete and chmod outcomes', async () => {
    const h = makeHarness();
    await h.handlers.deleteRemote('p1', '/gone.txt');
    await h.handlers.chmodRemote('p1', '/c.txt', 0o644);
    expect(h.history.list().map((e) => e.kind).sort()).toEqual(['chmod', 'delete']);
  });

  it('gives every history entry a distinct id', async () => {
    const h = makeHarness();
    await h.handlers.deleteRemote('p1', '/a');
    await h.handlers.deleteRemote('p1', '/b');
    const ids = h.history.list().map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('profile and settings handlers', () => {
  it('passes the cleanup options through to deleteProfile', async () => {
    const h = makeHarness();
    await h.handlers.deleteProfile('p1', { removeRelatedData: true, removeBackups: true });
    expect(h.calls).toContainEqual({
      name: 'deleteProfile',
      args: ['p1', { removeRelatedData: true, removeBackups: true }],
    });
  });

  it('exposes the current settings and persists updates', async () => {
    const h = makeHarness();
    expect(h.handlers.getSettings()).toEqual(DEFAULT_SETTINGS);
    const saved = await h.handlers.saveSettings({ diff: { maxBytes: 4096 } });
    expect(h.savedSettings).toEqual([{ diff: { maxBytes: 4096 } }]);
    expect(saved.diff.maxBytes).toBe(4096);
    expect(h.handlers.getSettings().diff.maxBytes).toBe(4096);
  });

  it('delegates plain lookups to the service', async () => {
    const h = makeHarness();
    await h.handlers.listRemote('p1', '/pub');
    await h.handlers.prepareUpload('p1', '/l/a', '/r/a');
    expect(h.calls.map((c) => c.name)).toEqual(['listRemote', 'prepareUpload']);
  });

  it('delegates isDirectory to the deps', async () => {
    const h = makeHarness();
    await expect(h.handlers.isDirectory('/home/u/dir')).resolves.toBe(true);
    await expect(h.handlers.isDirectory('/home/u/a.txt')).resolves.toBe(false);
  });
});
