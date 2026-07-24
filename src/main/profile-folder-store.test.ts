import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileFolderStore } from './profile-folder-store';

describe('ProfileFolderStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-pf-'));
    filePath = join(dir, 'nested', 'profile-folders.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty list when the file does not exist', async () => {
    expect(await new ProfileFolderStore(filePath).list()).toEqual([]);
  });

  it('saves and reloads folders sorted by order (creating parent directories)', async () => {
    const store = new ProfileFolderStore(filePath);
    await store.saveAll([
      { id: 'b', name: 'B', order: 1 },
      { id: 'a', name: 'A', order: 0 },
    ]);
    const reloaded = await new ProfileFolderStore(filePath).list();
    expect(reloaded.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
