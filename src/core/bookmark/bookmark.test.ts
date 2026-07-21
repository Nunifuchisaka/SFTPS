import { describe, it, expect } from 'vitest';
import {
  BookmarkStore,
  normalizeBookmarkPath,
  serializeBookmarks,
  parseBookmarks,
  type BookmarkInput,
} from './index';

function input(over: Partial<BookmarkInput> = {}): BookmarkInput {
  return {
    id: 'b1',
    profileId: 'p1',
    name: '公開ディレクトリ',
    remotePath: '/var/www/pub',
    ...over,
  };
}

describe('normalizeBookmarkPath', () => {
  it('strips a trailing slash, collapses duplicates and prepends a leading slash', () => {
    expect(normalizeBookmarkPath('var/www/pub')).toBe('/var/www/pub');
    expect(normalizeBookmarkPath('/var/www/pub/')).toBe('/var/www/pub');
    expect(normalizeBookmarkPath('//var///www//pub//')).toBe('/var/www/pub');
    expect(normalizeBookmarkPath('/')).toBe('/');
  });
});

describe('BookmarkStore add/list', () => {
  it('keeps insertion order and stores the normalized path', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a', remotePath: '/pub/' }));
    store.add(input({ id: 'b', remotePath: 'assets//img/' }));
    expect(store.list().map((b) => b.id)).toEqual(['a', 'b']);
    expect(store.list().map((b) => b.remotePath)).toEqual(['/pub', '/assets/img']);
  });

  it('trims the display name', () => {
    const store = new BookmarkStore();
    const added = store.add(input({ name: '  公開  ' }));
    expect(added.name).toBe('公開');
  });

  it('filters by profileId', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a', profileId: 'p1' }));
    store.add(input({ id: 'b', profileId: 'p2' }));
    expect(store.list('p1').map((b) => b.id)).toEqual(['a']);
    expect(store.list('p2').map((b) => b.id)).toEqual(['b']);
    expect(store.list().map((b) => b.id)).toEqual(['a', 'b']);
  });
});

describe('BookmarkStore duplicate prevention', () => {
  it('does not add a second bookmark for the same profile and normalized path', () => {
    const store = new BookmarkStore();
    const first = store.add(input({ id: 'a', remotePath: '/pub' }));
    const again = store.add(input({ id: 'b', name: '別名', remotePath: '//pub/' }));
    expect(store.list()).toHaveLength(1);
    expect(again).toEqual(first);
  });

  it('allows the same path under a different profile', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a', profileId: 'p1', remotePath: '/pub' }));
    store.add(input({ id: 'b', profileId: 'p2', remotePath: '/pub' }));
    expect(store.list().map((b) => b.id)).toEqual(['a', 'b']);
  });
});

describe('BookmarkStore validation', () => {
  it('rejects an empty or whitespace-only name', () => {
    const store = new BookmarkStore();
    expect(() => store.add(input({ name: '' }))).toThrow();
    expect(() => store.add(input({ name: '   ' }))).toThrow();
    expect(store.list()).toEqual([]);
  });

  it('rejects an empty remotePath', () => {
    const store = new BookmarkStore();
    expect(() => store.add(input({ remotePath: '' }))).toThrow();
    expect(() => store.add(input({ remotePath: '   ' }))).toThrow();
    expect(store.list()).toEqual([]);
  });
});

describe('BookmarkStore remove/rename', () => {
  it('removes by id', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a', remotePath: '/a' }));
    store.add(input({ id: 'b', remotePath: '/b' }));
    store.remove('a');
    expect(store.list().map((b) => b.id)).toEqual(['b']);
  });

  it('ignores removal of an unknown id', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a' }));
    expect(() => store.remove('zzz')).not.toThrow();
    expect(store.list()).toHaveLength(1);
  });

  it('renames by id, keeping the position', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a', remotePath: '/a' }));
    store.add(input({ id: 'b', remotePath: '/b' }));
    const renamed = store.rename('a', '  新しい名前 ');
    expect(renamed.name).toBe('新しい名前');
    expect(store.list().map((b) => b.id)).toEqual(['a', 'b']);
    expect(store.list()[0].name).toBe('新しい名前');
  });

  it('throws when renaming an unknown id or to an empty name', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a' }));
    expect(() => store.rename('zzz', 'x')).toThrow();
    expect(() => store.rename('a', '  ')).toThrow();
  });
});

describe('BookmarkStore secret safety', () => {
  it('throws if a secret field is present in the input (never persisted)', () => {
    const store = new BookmarkStore();
    const dirty = { ...input(), password: 'hunter2' } as unknown as BookmarkInput;
    expect(() => store.add(dirty)).toThrow();
    expect(store.list()).toEqual([]);
  });

  it('drops unknown non-secret fields (whitelist only)', () => {
    const store = new BookmarkStore();
    const extra = { ...input({ id: 'a' }), foo: 'bar' } as unknown as BookmarkInput;
    const added = store.add(extra);
    expect(added).not.toHaveProperty('foo');
    expect(store.list()[0]).not.toHaveProperty('foo');
  });
});

describe('bookmark JSON round-trip', () => {
  it('serializes and parses back to equivalent bookmarks in the same order', () => {
    const store = new BookmarkStore();
    store.add(input({ id: 'a', remotePath: '/a' }));
    store.add(input({ id: 'b', remotePath: '/b', name: 'B' }));

    const restored = parseBookmarks(serializeBookmarks(store));
    expect(restored).toEqual(store.list());

    const store2 = new BookmarkStore({ initial: restored });
    expect(store2.list().map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('rejects a JSON payload carrying a secret field', () => {
    const json = JSON.stringify([
      { id: 'a', profileId: 'p1', name: 'x', remotePath: '/a', password: 'hunter2' },
    ]);
    expect(() => parseBookmarks(json)).toThrow();
  });

  it('drops unknown fields when parsing (whitelist rebuild)', () => {
    const json = JSON.stringify([
      { id: 'a', profileId: 'p1', name: 'x', remotePath: '/a', foo: 'bar' },
    ]);
    expect(parseBookmarks(json)[0]).not.toHaveProperty('foo');
  });

  it('rejects a non-array payload', () => {
    expect(() => parseBookmarks('{}')).toThrow();
  });
});
