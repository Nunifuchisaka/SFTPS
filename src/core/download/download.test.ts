import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../transport/index';
import { BackupManager } from '../backup/index';
import { prepareDownload, commitDownload, downloadBackupKey } from './index';

describe('download (integration, two LocalTransports, no mocks)', () => {
  let dir: string;
  let remoteRoot: string;
  let localRoot: string;
  let backupRoot: string;
  let remote: LocalTransport;
  let local: LocalTransport;
  let backupManager: BackupManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-dl-'));
    remoteRoot = join(dir, 'remote');
    localRoot = join(dir, 'local');
    backupRoot = join(dir, 'backups');
    remote = new LocalTransport(remoteRoot);
    local = new LocalTransport(localRoot);
    await remote.connect();
    await local.connect();
    backupManager = new BackupManager({ backupRoot });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('prepareDownload diffs existing local (before) vs remote (after)', async () => {
    await remote.writeFile('/page.html', Buffer.from('axc', 'utf8'));
    await local.writeFile('/page.html', Buffer.from('abc', 'utf8'));

    const preview = await prepareDownload(remote, local, '/page.html', '/page.html');
    expect(preview.isNew).toBe(false);
    expect(preview.binary).toBe(false);
    expect(preview.beforeSize).toBe(3); // existing local
    expect(preview.afterSize).toBe(3); // incoming remote
    // b is local-only (removed), x is remote-only (added)
    expect(preview.segments).toContainEqual({ type: 'removed', value: 'b' });
    expect(preview.segments).toContainEqual({ type: 'added', value: 'x' });
  });

  it('prepareDownload flags a brand-new local file', async () => {
    await remote.writeFile('/new.txt', Buffer.from('hello', 'utf8'));
    const preview = await prepareDownload(remote, local, '/new.txt', '/new.txt');
    expect(preview.isNew).toBe(true);
    expect(preview.afterSize).toBe(5);
    expect(preview.segments).toBeUndefined();
  });

  it('prepareDownload falls back to size comparison for binary content', async () => {
    await remote.writeFile('/img.bin', Buffer.from([0x00, 0x01, 0x02, 0x03]));
    await local.writeFile('/img.bin', Buffer.from([0x00, 0x01, 0x02]));
    const preview = await prepareDownload(remote, local, '/img.bin', '/img.bin');
    expect(preview.binary).toBe(true);
    expect(preview.beforeSize).toBe(3);
    expect(preview.afterSize).toBe(4);
  });

  it('commitDownload backs up the existing local file before overwriting', async () => {
    await remote.writeFile('/f.txt', Buffer.from('NEW', 'utf8'));
    await local.writeFile('/f.txt', Buffer.from('OLD', 'utf8'));

    const result = await commitDownload(remote, local, backupManager, 'p1', '/f.txt', '/f.txt');
    expect(result.backupPath).not.toBeNull();
    expect((await local.readFile('/f.txt')).toString()).toBe('NEW');
    const backups = await backupManager.listBackups(downloadBackupKey('p1'), '/f.txt');
    expect(backups).toHaveLength(1);
    expect((await backupManager.restore(downloadBackupKey('p1'), '/f.txt')).toString()).toBe('OLD');
  });

  it('commitDownload verifies integrity after transfer when requested', async () => {
    await remote.writeFile('/v.txt', Buffer.from('verify-me', 'utf8'));
    const result = await commitDownload(remote, local, backupManager, 'p1', '/v.txt', '/v.txt', {
      verifyAfterTransfer: true,
    });
    expect(result.verified).toBe(true);
    expect((await local.readFile('/v.txt')).toString()).toBe('verify-me');
  });

  it('commitDownload skips backup for a new local file', async () => {
    await remote.writeFile('/fresh.txt', Buffer.from('fresh', 'utf8'));
    const result = await commitDownload(remote, local, backupManager, 'p1', '/fresh.txt', '/fresh.txt');
    expect(result.backupPath).toBeNull();
    expect(result.bytesWritten).toBe(5);
    expect((await local.readFile('/fresh.txt')).toString()).toBe('fresh');
  });

  it('download backups do not collide with upload backups (same profileId + path)', async () => {
    await remote.writeFile('/x.txt', Buffer.from('REMOTE_OLD', 'utf8'));
    await local.writeFile('/x.txt', Buffer.from('LOCAL_OLD', 'utf8'));

    // upload-style backup uses the plain profileId (as commitUpload does)
    await backupManager.backupExisting(remote, 'p1', '/x.txt');
    // download commit backs up the local file under the download namespace
    await commitDownload(remote, local, backupManager, 'p1', '/x.txt', '/x.txt');

    expect((await backupManager.restore('p1', '/x.txt')).toString()).toBe('REMOTE_OLD');
    expect((await backupManager.restore(downloadBackupKey('p1'), '/x.txt')).toString()).toBe('LOCAL_OLD');
  });
});
