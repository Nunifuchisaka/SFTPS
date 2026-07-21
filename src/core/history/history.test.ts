import { describe, it, expect } from 'vitest';
import {
  HistoryStore,
  serializeHistory,
  parseHistory,
  type HistoryInput,
} from './index';

function input(over: Partial<HistoryInput> = {}): HistoryInput {
  return {
    id: 't1',
    kind: 'upload',
    profileId: 'p1',
    path: '/pub/a.txt',
    status: 'success',
    ...over,
  };
}

describe('HistoryStore append/list', () => {
  it('lists entries newest-first and stamps the injected time', () => {
    const times = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'];
    let i = 0;
    const store = new HistoryStore({ now: () => new Date(times[i++]) });
    store.append(input({ id: 'a' }));
    store.append(input({ id: 'b' }));
    const list = store.list();
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
    expect(list[1].timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('clears all entries', () => {
    const store = new HistoryStore();
    store.append(input());
    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe('HistoryStore rotation', () => {
  it('drops the oldest entries beyond maxEntries', () => {
    let i = 0;
    const store = new HistoryStore({ maxEntries: 2, now: () => new Date(2026, 0, 1, 0, 0, i++) });
    store.append(input({ id: 'a' }));
    store.append(input({ id: 'b' }));
    store.append(input({ id: 'c' }));
    expect(store.list().map((e) => e.id)).toEqual(['c', 'b']);
  });
});

describe('HistoryStore filter', () => {
  it('filters by kind, status and profileId', () => {
    const store = new HistoryStore();
    store.append(input({ id: 'a', kind: 'upload', status: 'success', profileId: 'p1' }));
    store.append(input({ id: 'b', kind: 'download', status: 'failed', profileId: 'p1' }));
    store.append(input({ id: 'c', kind: 'upload', status: 'failed', profileId: 'p2' }));
    expect(store.list({ kind: 'upload' }).map((e) => e.id).sort()).toEqual(['a', 'c']);
    expect(store.list({ status: 'failed' }).map((e) => e.id).sort()).toEqual(['b', 'c']);
    expect(store.list({ profileId: 'p2' }).map((e) => e.id)).toEqual(['c']);
  });
});

describe('HistoryStore secret safety', () => {
  it('throws if a secret field is present in the input (never persisted)', () => {
    const store = new HistoryStore();
    const dirty = { ...input(), password: 'hunter2' } as unknown as HistoryInput;
    expect(() => store.append(dirty)).toThrow();
    expect(store.list()).toEqual([]);
  });

  it('drops unknown non-secret fields (whitelist only)', () => {
    const store = new HistoryStore();
    const extra = { ...input({ id: 'a' }), foo: 'bar' } as unknown as HistoryInput;
    const entry = store.append(extra);
    expect(entry).not.toHaveProperty('foo');
    expect(store.list()[0]).not.toHaveProperty('foo');
  });
});

describe('history JSON round-trip', () => {
  it('serializes and parses back to equivalent entries', () => {
    const store = new HistoryStore({ now: () => new Date('2026-05-01T00:00:00.000Z') });
    store.append(input({ id: 'a', bytes: 100 }));
    store.append(input({ id: 'b', status: 'failed', error: 'connection refused' }));

    const json = serializeHistory(store);
    const restored = parseHistory(json);
    expect(restored.map((e) => e.id).sort()).toEqual(['a', 'b']);

    const store2 = new HistoryStore({ initial: restored });
    expect(store2.list().map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('does not leak secret values into the serialized JSON', () => {
    const store = new HistoryStore();
    store.append(input({ id: 'a', error: 'ok' }));
    const json = serializeHistory(store);
    expect(json).not.toContain('password');
  });
});

describe('HistoryStore removeByProfile', () => {
  it('drops only the entries of the given profile and reports the count', () => {
    const store = new HistoryStore();
    store.append(input({ id: 'a', profileId: 'p1' }));
    store.append(input({ id: 'b', profileId: 'p2' }));
    store.append(input({ id: 'c', profileId: 'p1' }));

    expect(store.removeByProfile('p1')).toBe(2);
    expect(store.list().map((e) => e.id)).toEqual(['b']);
  });

  it('returns 0 when nothing matches', () => {
    const store = new HistoryStore();
    store.append(input({ id: 'a', profileId: 'p1' }));
    expect(store.removeByProfile('nope')).toBe(0);
    expect(store.list()).toHaveLength(1);
  });
});
