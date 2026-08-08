import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      electronMock.handlers.set(channel, handler);
    },
  },
}));

import { IPC } from '../../shared/ipc';
import { registerIpc } from './register';
import type { IpcHandlerDeps } from './handlers';

function deps(): IpcHandlerDeps {
  return {
    queue: {
      add: vi.fn(),
      list: () => [],
      overall: () => ({ transferred: 0, total: 0, ratio: 0 }),
      run: async () => undefined,
      cancelAll: () => undefined,
      clearCompleted: () => [],
    },
    recorder: {
      record: vi.fn(),
      sweep: vi.fn(),
      get recordedCount() {
        return 0;
      },
    },
  } as unknown as IpcHandlerDeps;
}

describe('registerIpc security boundary', () => {
  beforeEach(() => electronMock.handlers.clear());

  it('rejects an invocation before reaching a handler when the sender is untrusted', async () => {
    registerIpc(deps(), { isTrustedSender: () => false });
    const invoke = electronMock.handlers.get(IPC.queueStatus);
    await expect(Promise.resolve().then(() => invoke?.({}))).rejects.toThrow('untrusted IPC sender');
  });

  it('accepts a trusted sender', async () => {
    registerIpc(deps(), { isTrustedSender: () => true });
    const invoke = electronMock.handlers.get(IPC.queueStatus);
    await expect(Promise.resolve(invoke?.({}))).resolves.toEqual({
      tasks: [],
      overall: { transferred: 0, total: 0, ratio: 0 },
    });
  });

  it('rejects a malformed transfer request at the IPC boundary', async () => {
    registerIpc(deps(), { isTrustedSender: () => true });
    const invoke = electronMock.handlers.get(IPC.enqueueTransfer);
    await expect(
      Promise.resolve().then(() => invoke?.({}, { kind: 'download-sync', profileId: 'p1' })),
    ).rejects.toThrow();
  });
});
