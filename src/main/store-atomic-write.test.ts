import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileStore } from './profile-store';
import { HistoryFile } from './history-store';
import { BookmarkFile } from './bookmark-store';
import { KnownHostsFile } from './known-hosts-store';
import { SecretStore, type SafeStorageLike } from './secret-store';
import { HistoryStore } from '../core/history/index';
import { BookmarkStore } from '../core/bookmark/index';
import { KnownHostsStore } from '../core/hostkey/index';
import type { Profile } from '../core/profile/index';
import { writeFileAtomic } from './atomic-write';

// 直書き（writeFile）ではクラッシュ時に切り詰め破損するため、
// 全ストアが temp+rename のアトミック書き込みヘルパを経由することを型で担保する。
vi.mock('./atomic-write', () => ({
  STORE_FILE_MODE: 0o600,
  writeFileAtomic: vi.fn(async () => undefined),
}));

const atomic = vi.mocked(writeFileAtomic);

class FakeSafeStorage implements SafeStorageLike {
  isEncryptionAvailable(): boolean {
    return true;
  }
  encryptString(plainText: string): Buffer {
    return Buffer.from(`enc:${plainText}`, 'utf8');
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

describe('persistent stores delegate writing to writeFileAtomic', () => {
  beforeEach(() => {
    atomic.mockClear();
  });

  it('ProfileStore.saveAll', async () => {
    await new ProfileStore('/tmp/x/profiles.json').saveAll([profile]);
    expect(atomic).toHaveBeenCalledTimes(1);
    expect(atomic.mock.calls[0][0]).toBe('/tmp/x/profiles.json');
  });

  it('HistoryFile.save', async () => {
    await new HistoryFile('/tmp/x/history.json').save(new HistoryStore());
    expect(atomic).toHaveBeenCalledTimes(1);
  });

  it('BookmarkFile.save', async () => {
    await new BookmarkFile('/tmp/x/bookmarks.json').save(new BookmarkStore());
    expect(atomic).toHaveBeenCalledTimes(1);
  });

  it('KnownHostsFile.save', async () => {
    await new KnownHostsFile('/tmp/x/known_hosts.json').save(new KnownHostsStore());
    expect(atomic).toHaveBeenCalledTimes(1);
  });

  it('SecretStore.setSecrets', async () => {
    await new SecretStore({
      safeStorage: new FakeSafeStorage(),
      filePath: '/tmp/x/secrets.json',
    }).setSecrets('p1', { password: 'x' });
    expect(atomic).toHaveBeenCalledTimes(1);
  });
});
