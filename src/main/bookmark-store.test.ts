import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BookmarkFile } from './bookmark-store';

describe('BookmarkFile', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-bm-'));
    filePath = join(dir, 'nested', 'bookmarks.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty store when the file does not exist', async () => {
    const store = await new BookmarkFile(filePath).load();
    expect(store.list()).toEqual([]);
  });

  it('saves and reloads bookmarks in order (creating parent directories)', async () => {
    const file = new BookmarkFile(filePath);
    const store = await file.load();
    store.add({ id: 'a', profileId: 'p1', name: '公開', remotePath: '/pub/' });
    store.add({ id: 'b', profileId: 'p1', name: '画像', remotePath: '/assets/img' });
    await file.save(store);

    const reloaded = await new BookmarkFile(filePath).load();
    expect(reloaded.list().map((b) => b.id)).toEqual(['a', 'b']);
    expect(reloaded.list()[0].remotePath).toBe('/pub');
  });

  it('never writes secret fields to the JSON file', async () => {
    const file = new BookmarkFile(filePath);
    const store = await file.load();
    store.add({ id: 'a', profileId: 'p1', name: '公開', remotePath: '/pub' });
    await file.save(store);
    expect(await readFile(filePath, 'utf8')).not.toContain('password');
  });

  it('fails closed when the JSON is broken', async () => {
    const file = new BookmarkFile(join(dir, 'bookmarks.json'));
    await writeFile(join(dir, 'bookmarks.json'), 'not json', 'utf8');
    await expect(file.load()).rejects.toThrow();
  });
});
