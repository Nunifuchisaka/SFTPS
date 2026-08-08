import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from './profile-store';
import { HistoryFile } from './history-store';

describe('persistent stores fail closed', () => {
  it('does not turn a damaged profile file into an empty profile list', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'funabin-profile-load-'));
    const file = join(dir, 'profiles.json');
    try {
      await writeFile(file, '{ damaged', 'utf8');
      const store = new ProfileStore(file);
      await expect(store.list()).rejects.toThrow();
      expect(await readFile(file, 'utf8')).toBe('{ damaged');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not turn damaged history into an empty writable history', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'funabin-history-load-'));
    const file = join(dir, 'history.json');
    try {
      await writeFile(file, 'not json', 'utf8');
      await expect(new HistoryFile(file).load()).rejects.toThrow();
      expect(await readFile(file, 'utf8')).toBe('not json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
