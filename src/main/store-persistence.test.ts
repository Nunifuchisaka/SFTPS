import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from './profile-store';
import { HistoryFile } from './history-store';
import { BookmarkFile } from './bookmark-store';
import { SecretStore, type SafeStorageLike } from './secret-store';
import { ProfileFolderStore } from './profile-folder-store';
import { HistoryStore } from '../core/history/index';
import { BookmarkStore } from '../core/bookmark/index';
import type { Profile } from '../core/profile/index';

class FakeSafeStorage implements SafeStorageLike {
  isEncryptionAvailable(): boolean {
    return true;
  }
  encryptString(plainText: string): Buffer {
    return Buffer.concat([Buffer.from('enc:'), Buffer.from(plainText, 'utf8')]);
  }
  decryptString(encrypted: Buffer): string {
    return encrypted.toString('utf8').slice('enc:'.length);
  }
}

const profile: Profile = {
  id: 'p1',
  name: 'p1',
  protocol: 'sftp',
  host: 'example.com',
  port: 22,
  user: 'u',
};

/** 「保存を1回行う」だけの共通シナリオ（ストアごとの差異を吸収する）。 */
const cases: Array<{ name: string; file: string; save: (path: string) => Promise<void> }> = [
  {
    name: 'ProfileStore',
    file: 'profiles.json',
    save: (path) => new ProfileStore(path).saveAll([profile]),
  },
  {
    name: 'HistoryFile',
    file: 'history.json',
    save: (path) => new HistoryFile(path).save(new HistoryStore()),
  },
  {
    name: 'BookmarkFile',
    file: 'bookmarks.json',
    save: (path) => new BookmarkFile(path).save(new BookmarkStore()),
  },
  {
    name: 'SecretStore',
    file: 'secrets.json',
    save: (path) =>
      new SecretStore({ safeStorage: new FakeSafeStorage(), filePath: path }).setSecrets('p1', {
        password: 'x',
      }),
  },
  {
    name: 'ProfileFolderStore',
    file: 'profile-folders.json',
    save: (path) => new ProfileFolderStore(path).saveAll([{ id: 'f1', name: 'Prod', order: 0 }]),
  },
];

describe('persistent stores write atomically with owner-only permissions', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-store-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const c of cases) {
    it(`${c.name} leaves no temporary file behind`, async () => {
      const path = join(dir, c.file);
      await c.save(path);
      expect(await readdir(dir)).toEqual([c.file]);
    });

    it(`${c.name} restricts the file to the owner on POSIX`, async () => {
      const path = join(dir, c.file);
      await c.save(path);
      if (process.platform === 'win32') return;
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    });

    it(`${c.name} creates missing parent directories`, async () => {
      const path = join(dir, 'nested', c.file);
      await c.save(path);
      expect(await readdir(join(dir, 'nested'))).toEqual([c.file]);
    });
  }
});
