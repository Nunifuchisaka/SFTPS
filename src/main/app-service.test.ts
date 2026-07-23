import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../core/transport/index';
import { BackupManager } from '../core/backup/index';
import { HistoryStore } from '../core/history/index';
import { KnownHostsStore } from '../core/hostkey/index';
import type { FtpProfile, SftpProfile } from '../core/profile/index';
import { SecretStore, type SafeStorageLike } from './secret-store';
import { ProfileStore } from './profile-store';
import { BookmarkFile } from './bookmark-store';
import { AppService } from './app-service';

class FakeSafeStorage implements SafeStorageLike {
  available = true;
  isEncryptionAvailable() {
    return this.available;
  }
  encryptString(s: string) {
    return Buffer.concat([Buffer.from('enc:'), Buffer.from(s, 'utf8')]);
  }
  decryptString(b: Buffer) {
    return b.toString('utf8').slice('enc:'.length);
  }
}

const ftpProfile: FtpProfile = {
  id: 'p1',
  name: 'My FTP',
  protocol: 'ftp',
  host: 'ftp.example.com',
  port: 21,
  user: 'alice',
  password: 'hunter2',
};

const sftpProfile: SftpProfile = {
  id: 's1',
  name: 'My SFTP',
  protocol: 'sftp',
  host: 'sftp.example.com',
  port: 22,
  user: 'bob',
  password: 'pw',
  privateKey: 'KEYDATA',
  passphrase: 'phrase',
};

async function writeLocal(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

describe('AppService', () => {
  let dir: string;
  let profileFile: string;
  let secretFile: string;
  let bookmarkFile: string;
  let backupRoot: string;
  let remoteRoot: string;
  let localDir: string;
  let safe: FakeSafeStorage;
  let service: AppService;
  let transport: LocalTransport;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-svc-'));
    profileFile = join(dir, 'profiles.json');
    secretFile = join(dir, 'secrets.json');
    bookmarkFile = join(dir, 'bookmarks.json');
    backupRoot = join(dir, 'backups');
    remoteRoot = join(dir, 'remote');
    localDir = join(dir, 'local');
    safe = new FakeSafeStorage();
    transport = new LocalTransport(remoteRoot);

    let clock = 0;
    service = new AppService({
      profileStore: new ProfileStore(profileFile),
      secretStore: new SecretStore({ safeStorage: safe, filePath: secretFile }),
      bookmarkStore: new BookmarkFile(bookmarkFile),
      backupManager: new BackupManager({
        backupRoot,
        now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)),
      }),
      createTransport: () => transport,
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saveProfile separates secrets from the persisted profile JSON', async () => {
    const saved = await service.saveProfile(ftpProfile);
    expect(saved).not.toHaveProperty('password');

    const fileJson = await readFile(profileFile, 'utf8');
    expect(fileJson).not.toContain('hunter2');

    const list = await service.listProfiles();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('password');
  });

  it('saveProfile stores the secret in the SecretStore', async () => {
    await service.saveProfile(ftpProfile);
    const store = new SecretStore({ safeStorage: safe, filePath: secretFile });
    expect(await store.getSecrets('p1')).toEqual({ password: 'hunter2' });
  });

  it('saveProfile is rejected (nothing persisted) when encryption is unavailable and secrets exist', async () => {
    safe.available = false;
    await expect(service.saveProfile(ftpProfile)).rejects.toThrow();
    expect(await service.listProfiles()).toEqual([]);
  });

  it('saveProfile succeeds without encryption when there are no secrets', async () => {
    safe.available = false;
    const noSecret: FtpProfile = { ...ftpProfile, password: undefined };
    const saved = await service.saveProfile(noSecret);
    expect(saved.id).toBe('p1');
    expect(await service.listProfiles()).toHaveLength(1);
  });

  it('saveProfile keeps stored secrets that are left blank on re-save', async () => {
    await service.saveProfile(sftpProfile);
    // パスフレーズだけ入れ直した保存（他のシークレット欄は空欄）
    await service.saveProfile({ ...sftpProfile, privateKey: undefined, password: undefined, passphrase: 'newphrase' });

    const store = new SecretStore({ safeStorage: safe, filePath: secretFile });
    expect(await store.getSecrets('s1')).toEqual({
      password: 'pw',
      privateKey: 'KEYDATA',
      passphrase: 'newphrase',
    });
  });

  it('saveProfile with every secret field blank keeps all stored secrets', async () => {
    await service.saveProfile(sftpProfile);
    await service.saveProfile({
      ...sftpProfile,
      password: undefined,
      privateKey: undefined,
      passphrase: undefined,
    });

    const store = new SecretStore({ safeStorage: safe, filePath: secretFile });
    expect(await store.getSecrets('s1')).toEqual({
      password: 'pw',
      privateKey: 'KEYDATA',
      passphrase: 'phrase',
    });
  });

  it('saveProfile removes only the explicitly cleared secret', async () => {
    await service.saveProfile(sftpProfile);
    await service.saveProfile(
      { ...sftpProfile, password: undefined, privateKey: undefined, passphrase: undefined },
      { clearSecrets: ['privateKey'] },
    );

    const store = new SecretStore({ safeStorage: safe, filePath: secretFile });
    expect(await store.getSecrets('s1')).toEqual({ password: 'pw', passphrase: 'phrase' });
  });

  it('saveProfile never touches another profile\'s secrets', async () => {
    await service.saveProfile(ftpProfile);
    await service.saveProfile(sftpProfile);
    await service.saveProfile({ ...sftpProfile, password: undefined, privateKey: undefined, passphrase: 'x' });

    const store = new SecretStore({ safeStorage: safe, filePath: secretFile });
    expect(await store.getSecrets('p1')).toEqual({ password: 'hunter2' });
  });

  it('deleteProfile removes both the profile and its secret', async () => {
    await service.saveProfile(ftpProfile);
    await service.deleteProfile('p1');
    expect(await service.listProfiles()).toEqual([]);
    const store = new SecretStore({ safeStorage: safe, filePath: secretFile });
    expect(await store.getSecrets('p1')).toBeNull();
  });

  it('testConnection returns ok for a reachable transport', async () => {
    await service.saveProfile(ftpProfile);
    expect(await service.testConnection('p1')).toEqual({ ok: true });
  });

  it('commitUpload backs up the old remote file, then restoreBackup rolls it back', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/f.txt', Buffer.from('OLD', 'utf8'));
    const localPath = join(localDir, 'f.txt');
    await writeLocal(localPath, Buffer.from('NEW', 'utf8'));

    const preview = await service.prepareUpload('p1', localPath, '/f.txt');
    expect(preview.isNew).toBe(false);
    expect(preview.summary).toEqual({ added: 3, removed: 3 });

    const commit = await service.commitUpload('p1', localPath, '/f.txt');
    expect(commit.backupPath).not.toBeNull();
    expect((await transport.readFile('/f.txt')).toString('utf8')).toBe('NEW');

    const backups = await service.listBackups('p1', '/f.txt');
    expect(backups).toHaveLength(1);

    await service.restoreBackup('p1', '/f.txt');
    expect((await transport.readFile('/f.txt')).toString('utf8')).toBe('OLD');
  });

  it('rejects backup operations for a profile that does not exist', async () => {
    await service.saveProfile(ftpProfile);
    await expect(service.listBackups('nope', '/f.txt')).rejects.toThrow(/profile not found/);
    await expect(service.restoreBackup('nope', '/f.txt')).rejects.toThrow(/profile not found/);
  });

  it('rejects backup operations for a traversal-shaped profile id', async () => {
    await service.saveProfile(ftpProfile);
    await expect(service.listBackups('../../etc', '/f.txt')).rejects.toThrow(/profile not found/);
    await expect(service.restoreBackup('../../etc', '/f.txt')).rejects.toThrow(/profile not found/);
  });

  it('restoreBackup backs up the current remote content before overwriting it', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/f.txt', Buffer.from('GEN1', 'utf8'));
    const localPath = join(localDir, 'f.txt');
    await writeLocal(localPath, Buffer.from('GEN2', 'utf8'));
    await service.commitUpload('p1', localPath, '/f.txt'); // GEN1 をバックアップして GEN2 へ

    const restored = await service.restoreBackup('p1', '/f.txt');
    expect(restored.backupPath).not.toBeNull();
    expect((await readFile(restored.backupPath as string, 'utf8'))).toBe('GEN2');
    expect((await transport.readFile('/f.txt')).toString('utf8')).toBe('GEN1');

    // 直前の状態（GEN2）へ戻せる世代が残っている
    const generations = await service.listBackups('p1', '/f.txt');
    expect(generations.map((g) => g.size)).toContain(4);
    expect(generations).toHaveLength(2);
  });

  it('prepareSync plans without writing; commitSync applies with backups', async () => {
    await service.saveProfile(ftpProfile);
    const localDir = join(dir, 'localsrc');
    await writeLocal(join(localDir, 'a.txt'), Buffer.from('NEWDATA'));
    await writeLocal(join(localDir, 'sub', 'b.txt'), Buffer.from('bb'));
    await transport.connect();
    await transport.writeFile('/site/a.txt', Buffer.from('OLD'));

    const prep = await service.prepareSync('p1', localDir, '/site', { compareBy: 'size' });
    expect(prep.summary.upload).toBe(2); // a.txt(changed) + sub/b.txt(new)
    expect(prep.summary.createDir).toBe(1); // sub
    // dry run: nothing new written to the dest yet
    expect(await transport.exists('/site/sub/b.txt')).toBe(false);

    const commit = await service.commitSync('p1', localDir, '/site', { compareBy: 'size' });
    expect((await transport.readFile('/site/a.txt')).toString()).toBe('NEWDATA');
    expect((await transport.readFile('/site/sub/b.txt')).toString()).toBe('bb');
    expect(commit.result.uploaded).toBe(2);
    // overwrite of /site/a.txt was backed up
    const backups = await service.listBackups('p1', '/site/a.txt');
    expect(backups).toHaveLength(1);
    expect((await service.restoreBackup('p1', '/site/a.txt')).bytesWritten).toBe(3);
  });

  it('commitSync refuses an empty remote directory (it would resolve to the server root)', async () => {
    await service.saveProfile(ftpProfile);
    const srcDir = join(dir, 'emptydest');
    await writeLocal(join(srcDir, 'a.txt'), Buffer.from('a'));
    await expect(service.commitSync('p1', srcDir, '', { compareBy: 'size' })).rejects.toThrow();
  });

  it('commitSync refuses the server root while mirror deletion is enabled', async () => {
    await service.saveProfile(ftpProfile);
    const srcDir = join(dir, 'rootdest');
    await writeLocal(join(srcDir, 'a.txt'), Buffer.from('a'));
    await transport.connect();
    await transport.writeFile('/precious.txt', Buffer.from('KEEPME'));

    await expect(
      service.commitSync('p1', srcDir, '/', { compareBy: 'size', deleteExtraneous: true }),
    ).rejects.toThrow();
    expect((await transport.readFile('/precious.txt')).toString()).toBe('KEEPME');
  });

  it('commitSync still allows the server root when mirror deletion is off', async () => {
    await service.saveProfile(ftpProfile);
    const srcDir = join(dir, 'rootok');
    await writeLocal(join(srcDir, 'a.txt'), Buffer.from('a'));
    const r = await service.commitSync('p1', srcDir, '/', { compareBy: 'size' });
    expect(r.result.uploaded).toBe(1);
  });

  it('commitSync backs up extraneous remote files before mirror-deleting them', async () => {
    await service.saveProfile(ftpProfile);
    const srcDir = join(dir, 'mirror');
    await writeLocal(join(srcDir, 'a.txt'), Buffer.from('a'));
    await transport.connect();
    await transport.writeFile('/site/gone.txt', Buffer.from('LOST'));

    const r = await service.commitSync('p1', srcDir, '/site', {
      compareBy: 'size',
      deleteExtraneous: true,
    });
    expect(r.result.deleted).toBe(1);
    expect(await transport.exists('/site/gone.txt')).toBe(false);
    expect((await service.restoreBackup('p1', '/site/gone.txt')).bytesWritten).toBe(4);
  });

  it('commitUpload does not touch the remote when the signal is already aborted', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/keep.txt', Buffer.from('OLD'));
    const localPath = join(localDir, 'keep.txt');
    await writeLocal(localPath, Buffer.from('NEW'));

    const controller = new AbortController();
    controller.abort();
    await expect(
      service.commitUpload('p1', localPath, '/keep.txt', {}, controller.signal),
    ).rejects.toThrow(/cancel/i);
    expect((await transport.readFile('/keep.txt')).toString()).toBe('OLD');
  });

  it('download does not write locally when the signal is already aborted', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/d2.txt', Buffer.from('payload'));
    const savePath = join(localDir, 'd2.txt');

    const controller = new AbortController();
    controller.abort();
    await expect(
      service.download('p1', '/d2.txt', savePath, controller.signal),
    ).rejects.toThrow(/cancel/i);
    expect(existsSync(savePath)).toBe(false);
  });

  it('commitSync stops without transferring when the signal is already aborted', async () => {
    await service.saveProfile(ftpProfile);
    const srcDir = join(dir, 'cancelsync');
    await writeLocal(join(srcDir, 'a.txt'), Buffer.from('a'));

    const controller = new AbortController();
    controller.abort();
    const r = await service.commitSync(
      'p1',
      srcDir,
      '/canceled',
      { compareBy: 'size' },
      controller.signal,
    );
    expect(r.result.canceled).toBe(true);
    expect(r.result.uploaded).toBe(0);
    expect(await transport.exists('/canceled/a.txt')).toBe(false);
  });

  it('commitDownloadSync downloads new/changed remote files into a local folder with backups', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/site/a.txt', Buffer.from('NEWDATA'));
    await transport.writeFile('/site/sub/b.txt', Buffer.from('bb'));
    const destDir = join(dir, 'localdest');
    await writeLocal(join(destDir, 'a.txt'), Buffer.from('OLD'));

    const r = await service.commitDownloadSync('p1', '/site', destDir, { compareBy: 'size' });
    expect((await readFile(join(destDir, 'a.txt'), 'utf8'))).toBe('NEWDATA');
    expect((await readFile(join(destDir, 'sub', 'b.txt'), 'utf8'))).toBe('bb');
    expect(r.result.uploaded).toBe(2);
    // overwrite of the existing local a.txt was backed up
    const backups = await service.listBackups('p1', '/a.txt');
    expect(backups).toHaveLength(1);
  });

  it('commitDownloadSync mirror-deletes extraneous local files (with backup) when deleteExtraneous is on', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/site/a.txt', Buffer.from('a'));
    const destDir = join(dir, 'mirrordest');
    await writeLocal(join(destDir, 'gone.txt'), Buffer.from('LOST'));

    const r = await service.commitDownloadSync('p1', '/site', destDir, {
      compareBy: 'size',
      deleteExtraneous: true,
    });
    expect(r.result.deleted).toBe(1);
    expect(existsSync(join(destDir, 'gone.txt'))).toBe(false);
    const backups = await service.listBackups('p1', '/gone.txt');
    expect(backups).toHaveLength(1);
  });

  it('commitDownloadSync stops without transferring when the signal is already aborted', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/canceldl/a.txt', Buffer.from('a'));
    const destDir = join(dir, 'canceldldest');

    const controller = new AbortController();
    controller.abort();
    const r = await service.commitDownloadSync(
      'p1',
      '/canceldl',
      destDir,
      { compareBy: 'size' },
      controller.signal,
    );
    expect(r.result.canceled).toBe(true);
    expect(r.result.uploaded).toBe(0);
    expect(existsSync(join(destDir, 'a.txt'))).toBe(false);
  });

  it('renameRemote moves a remote file', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/a.txt', Buffer.from('hi'));
    await service.renameRemote('p1', '/a.txt', '/b.txt');
    expect(await transport.exists('/a.txt')).toBe(false);
    expect((await transport.readFile('/b.txt')).toString()).toBe('hi');
  });

  it('deleteRemote removes a remote file', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/gone.txt', Buffer.from('x'));
    await service.deleteRemote('p1', '/gone.txt');
    expect(await transport.exists('/gone.txt')).toBe(false);
  });

  it('chmodRemote applies a mode when the transport supports it', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/c.txt', Buffer.from('x'));
    await expect(service.chmodRemote('p1', '/c.txt', 0o644)).resolves.toBeUndefined();
  });

  it('prepareSync with compareBy checksum detects same-size content changes', async () => {
    await service.saveProfile(ftpProfile);
    const srcDir = join(dir, 'csrc');
    await writeLocal(join(srcDir, 'a.txt'), Buffer.from('AAA', 'utf8'));
    await transport.connect();
    await transport.writeFile('/cdst/a.txt', Buffer.from('BBB', 'utf8')); // same size, different content

    const sizePlan = await service.prepareSync('p1', srcDir, '/cdst', { compareBy: 'size' });
    expect(sizePlan.summary.upload).toBe(0); // size compare misses it

    const checkPlan = await service.prepareSync('p1', srcDir, '/cdst', { compareBy: 'checksum' });
    expect(checkPlan.summary.upload).toBe(1); // checksum catches it
  });

  it('commitUpload passes verifyAfterTransfer through to the core', async () => {
    await service.saveProfile(ftpProfile);
    const localPath = join(localDir, 'vv.txt');
    await writeLocal(localPath, Buffer.from('checkme', 'utf8'));
    const result = await service.commitUpload('p1', localPath, '/vv.txt', { verifyAfterTransfer: true });
    expect(result.verified).toBe(true);
  });

  it('download passes verifyAfterTransfer through to the core', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/vv.txt', Buffer.from('checkme', 'utf8'));
    const savePath = join(localDir, 'vv.txt');
    const result = await service.download('p1', '/vv.txt', savePath, undefined, { verifyAfterTransfer: true });
    expect(result.verified).toBe(true);
  });

  it('download writes the remote file to a local path', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/d.txt', Buffer.from('payload', 'utf8'));
    const savePath = join(localDir, 'downloaded.txt');
    const result = await service.download('p1', '/d.txt', savePath);
    expect(result.bytesWritten).toBe(7);
    expect((await readFile(savePath, 'utf8'))).toBe('payload');
  });

  it('prepareDownload previews existing-local (before) vs remote (after)', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/p.txt', Buffer.from('axc', 'utf8'));
    const savePath = join(localDir, 'p.txt');
    await writeLocal(savePath, Buffer.from('abc', 'utf8'));

    const preview = await service.prepareDownload('p1', '/p.txt', savePath);
    expect(preview.isNew).toBe(false);
    expect(preview.summary).toEqual({ added: 1, removed: 1 });
  });

  it('download backs up the existing local file before overwriting', async () => {
    await service.saveProfile(ftpProfile);
    await transport.connect();
    await transport.writeFile('/r.txt', Buffer.from('REMOTE', 'utf8'));
    const savePath = join(localDir, 'r.txt');
    await writeLocal(savePath, Buffer.from('LOCALOLD', 'utf8'));

    const result = await service.download('p1', '/r.txt', savePath);
    expect(result.backupPath).not.toBeNull();
    expect((await readFile(result.backupPath as string, 'utf8'))).toBe('LOCALOLD');
    expect((await readFile(savePath, 'utf8'))).toBe('REMOTE');
  });

  it('addBookmark persists a normalized bookmark and listBookmarks reads it back', async () => {
    const added = await service.addBookmark({
      id: 'b1',
      profileId: 'p1',
      name: '  公開  ',
      remotePath: '/var/www//pub/',
    });
    expect(added).toEqual({ id: 'b1', profileId: 'p1', name: '公開', remotePath: '/var/www/pub' });
    expect(await service.listBookmarks()).toEqual([added]);
    expect(await readFile(bookmarkFile, 'utf8')).toContain('/var/www/pub');
  });

  it('addBookmark ignores a duplicate path for the same profile', async () => {
    await service.addBookmark({ id: 'b1', profileId: 'p1', name: 'A', remotePath: '/pub' });
    await service.addBookmark({ id: 'b2', profileId: 'p1', name: 'B', remotePath: '//pub/' });
    await service.addBookmark({ id: 'b3', profileId: 'p2', name: 'C', remotePath: '/pub' });
    expect((await service.listBookmarks()).map((b) => b.id)).toEqual(['b1', 'b3']);
    expect((await service.listBookmarks('p1')).map((b) => b.id)).toEqual(['b1']);
  });

  it('renameBookmark and removeBookmark update the persisted file', async () => {
    await service.addBookmark({ id: 'b1', profileId: 'p1', name: 'A', remotePath: '/a' });
    await service.addBookmark({ id: 'b2', profileId: 'p1', name: 'B', remotePath: '/b' });

    const renamed = await service.renameBookmark('b1', 'AAA');
    expect(renamed.name).toBe('AAA');
    expect((await service.listBookmarks()).map((b) => b.name)).toEqual(['AAA', 'B']);

    await service.removeBookmark('b1');
    expect((await service.listBookmarks()).map((b) => b.id)).toEqual(['b2']);
  });

  it('addBookmark rejects an empty name without persisting anything', async () => {
    await expect(
      service.addBookmark({ id: 'b1', profileId: 'p1', name: '   ', remotePath: '/a' }),
    ).rejects.toThrow();
    expect(await service.listBookmarks()).toEqual([]);
  });
});

describe('AppService profile deletion cleanup', () => {
  let dir: string;
  let backupRoot: string;
  let service: AppService;
  let transport: LocalTransport;
  let history: HistoryStore;
  let knownHosts: KnownHostsStore;
  let removedHosts: Array<{ host: string; port: number }>;

  const target: SftpProfile = {
    id: 'del1',
    name: 'to delete',
    protocol: 'sftp',
    host: 'del.example',
    port: 22,
    user: 'u',
    password: 'pw',
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-del-'));
    backupRoot = join(dir, 'backups');
    transport = new LocalTransport(join(dir, 'remote'));
    history = new HistoryStore();
    knownHosts = new KnownHostsStore({ 'del.example:22': 'SHA256:aaa' });
    removedHosts = [];

    let clock = 0;
    service = new AppService({
      profileStore: new ProfileStore(join(dir, 'profiles.json')),
      secretStore: new SecretStore({
        safeStorage: new FakeSafeStorage(),
        filePath: join(dir, 'secrets.json'),
      }),
      bookmarkStore: new BookmarkFile(join(dir, 'bookmarks.json')),
      backupManager: new BackupManager({
        backupRoot,
        now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)),
      }),
      createTransport: () => transport,
      historyStore: history,
      knownHosts: {
        list: () => knownHosts.list(),
        remove: async (host, port) => {
          removedHosts.push({ host, port });
          return knownHosts.remove(host, port);
        },
      },
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function seed(): Promise<void> {
    await service.saveProfile(target);
    await service.addBookmark({ id: 'b1', profileId: 'del1', name: 'pub', remotePath: '/pub' });
    await service.addBookmark({ id: 'b2', profileId: 'keep', name: 'other', remotePath: '/pub' });
    history.append({ id: 'h1', kind: 'upload', profileId: 'del1', path: '/a', status: 'success' });
    history.append({ id: 'h2', kind: 'upload', profileId: 'keep', path: '/a', status: 'success' });
    await transport.connect();
    await transport.writeFile('/a.txt', Buffer.from('OLD'));
    const localPath = join(dir, 'a.txt');
    await writeLocal(localPath, Buffer.from('NEW', 'utf8'));
    await service.commitUpload('del1', localPath, '/a.txt');
  }

  it('leaves related data untouched by default (least surprise)', async () => {
    await seed();
    const result = await service.deleteProfile('del1');
    expect(await service.listProfiles()).toEqual([]);
    expect(result).toEqual({
      removedBookmarks: 0,
      removedHistory: 0,
      removedKnownHosts: 0,
      purgedBackupNamespaces: 0,
    });
    expect((await service.listBookmarks('del1')).map((b) => b.id)).toEqual(['b1']);
    expect(history.list()).toHaveLength(2);
    expect(knownHosts.list()).toHaveLength(1);
  });

  it('removes bookmarks, history and the host key when related data removal is requested', async () => {
    await seed();
    const result = await service.deleteProfile('del1', { removeRelatedData: true });
    expect(result.removedBookmarks).toBe(1);
    expect(result.removedHistory).toBe(1);
    expect(result.removedKnownHosts).toBe(1);
    expect((await service.listBookmarks()).map((b) => b.id)).toEqual(['b2']);
    expect(history.list().map((e) => e.id)).toEqual(['h2']);
    expect(removedHosts).toEqual([{ host: 'del.example', port: 22 }]);
    expect(knownHosts.list()).toEqual([]);
  });

  it('keeps backups unless they are explicitly requested (they are a recovery path)', async () => {
    await seed();
    await service.deleteProfile('del1', { removeRelatedData: true });
    expect(existsSync(join(backupRoot, 'del1'))).toBe(true);
  });

  it('purges the backup namespaces when backup removal is requested', async () => {
    await seed();
    const result = await service.deleteProfile('del1', {
      removeRelatedData: true,
      removeBackups: true,
    });
    expect(result.purgedBackupNamespaces).toBe(2);
    expect(existsSync(join(backupRoot, 'del1'))).toBe(false);
  });

  it('rejects a traversal-shaped profile id before deleting anything', async () => {
    await seed();
    await expect(service.deleteProfile('../../etc', { removeBackups: true })).rejects.toThrow(
      /invalid profile id/,
    );
    expect(await service.listProfiles()).toHaveLength(1);
  });
});

describe('AppService diff size limit', () => {
  let dir: string;
  let service: AppService;
  let transport: LocalTransport;
  let maxBytes: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-difflimit-'));
    transport = new LocalTransport(join(dir, 'remote'));
    maxBytes = 16;
    service = new AppService({
      profileStore: new ProfileStore(join(dir, 'profiles.json')),
      secretStore: new SecretStore({
        safeStorage: new FakeSafeStorage(),
        filePath: join(dir, 'secrets.json'),
      }),
      bookmarkStore: new BookmarkFile(join(dir, 'bookmarks.json')),
      backupManager: new BackupManager({ backupRoot: join(dir, 'backups') }),
      createTransport: () => transport,
      settings: () => ({ backup: { maxGenerations: 20, maxAgeDays: null }, diff: { maxBytes } }),
    });
    await service.saveProfile(ftpProfile);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('skips the character diff on upload preview when over the configured limit', async () => {
    await transport.connect();
    await transport.writeFile('/big.txt', Buffer.from('a'.repeat(100), 'utf8'));
    const localPath = join(dir, 'big.txt');
    await writeLocal(localPath, Buffer.from('b'.repeat(100), 'utf8'));

    const preview = await service.prepareUpload('p1', localPath, '/big.txt');
    expect(preview.tooLarge).toBe(true);
    expect(preview.diffLimitBytes).toBe(16);
  });

  it('skips the character diff on download preview when over the configured limit', async () => {
    await transport.connect();
    await transport.writeFile('/big.txt', Buffer.from('a'.repeat(100), 'utf8'));
    const savePath = join(dir, 'local', 'big.txt');
    await writeLocal(savePath, Buffer.from('b'.repeat(100), 'utf8'));

    const preview = await service.prepareDownload('p1', '/big.txt', savePath);
    expect(preview.tooLarge).toBe(true);
  });

  it('still diffs normally when the content fits the limit', async () => {
    maxBytes = 1024;
    await transport.connect();
    await transport.writeFile('/s.txt', Buffer.from('abc', 'utf8'));
    const localPath = join(dir, 's.txt');
    await writeLocal(localPath, Buffer.from('axc', 'utf8'));

    const preview = await service.prepareUpload('p1', localPath, '/s.txt');
    expect(preview.tooLarge).toBeFalsy();
    expect(preview.summary).toEqual({ added: 1, removed: 1 });
  });
});
