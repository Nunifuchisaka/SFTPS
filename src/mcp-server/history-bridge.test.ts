import { describe, it, expect } from 'vitest';
import type { HistoryInput } from '../core/history/index';
import { McpHistoryBridge, type HistoryAppendGateway } from './history-bridge';

function fakeHistory(): { gateway: HistoryAppendGateway; entries: HistoryInput[] } {
  const entries: HistoryInput[] = [];
  return { gateway: { append: (input) => entries.push(input) }, entries };
}

describe('McpHistoryBridge', () => {
  it('records a success entry with a unique id when the action resolves', async () => {
    const { gateway, entries } = fakeHistory();
    const bridge = new McpHistoryBridge(gateway, () => 'fixed-id');

    const result = await bridge.run('upload', 'p1', '/a.txt', async () => 'done');

    expect(result).toBe('done');
    expect(entries).toEqual([{ id: 'fixed-id', kind: 'upload', profileId: 'p1', path: '/a.txt', status: 'success' }]);
  });

  it('records a failure entry with the error message and rethrows', async () => {
    const { gateway, entries } = fakeHistory();
    const bridge = new McpHistoryBridge(gateway, () => 'fixed-id');

    await expect(
      bridge.run('download', 'p1', '/b.txt', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(entries).toEqual([
      { id: 'fixed-id', kind: 'download', profileId: 'p1', path: '/b.txt', status: 'failed', error: 'boom' },
    ]);
  });

  it('stringifies non-Error throwables', async () => {
    const { gateway, entries } = fakeHistory();
    const bridge = new McpHistoryBridge(gateway, () => 'fixed-id');

    await expect(
      bridge.run('sync', 'p1', '/site', async () => {
        throw 'not an Error object';
      }),
    ).rejects.toBe('not an Error object');

    expect(entries[0]?.error).toBe('not an Error object');
  });
});
