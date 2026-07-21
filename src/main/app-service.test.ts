import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../core/transport/index';
import { BackupManager } from '../core/backup/index';
import type { FtpProfile } from '../core/profile/index';
import { SecretStore, type SafeStorageLike } from './secret-store';
import { ProfileStore } from './profile-store';
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

async function writeLocal(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

describe('AppService', () => {
  let dir: string;
  let profileFile: string;
  let secretFile: string;
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
    backupRoot = join(dir, 'backups');
    remoteRoot = join(dir, 'remote');
    localDir = join(dir, 'local');
    safe = new FakeSafeStorage();
    transport = new LocalTransport(remoteRoot);

    let clock = 0;
    service = new AppService({
      profileStore: new ProfileStore(profileFile),
      secretStore: new SecretStore({ safeStorage: safe, filePath: secretFile }),
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
});
