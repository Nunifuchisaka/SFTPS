import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { LocalTransport } from '../transport/local-transport';
import { BackupManager, sanitizeRemotePath, sanitizeBackupNamespace } from './index';

describe('sanitizeRemotePath', () => {
  it('replaces characters not allowed in Windows file names', () => {
    const s = sanitizeRemotePath('/a:b*c?d"e<f>g|h\\i/j');
    expect(s).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('does not collide for paths that the legacy replacement scheme conflated', () => {
    expect(sanitizeRemotePath('/a/b')).not.toBe(sanitizeRemotePath('/a_b'));
    expect(sanitizeRemotePath('/a:b')).not.toBe(sanitizeRemotePath('/a_b'));
  });

  it('uses a fixed-length Windows-safe key for very long remote paths', () => {
    const key = sanitizeRemotePath(`/${'deep/'.repeat(1000)}file.txt`);
    expect(key).toMatch(/^v2_[a-f0-9]{64}$/);
  });
});

describe('sanitizeBackupNamespace', () => {
  it('leaves a plain profile id untouched', () => {
    expect(sanitizeBackupNamespace('p1')).toBe('p1');
  });

  it('preserves the download sub-namespace', () => {
    expect(sanitizeBackupNamespace('p1/download')).toBe('p1/download');
  });

  it('neutralizes parent-directory segments', () => {
    expect(sanitizeBackupNamespace('../../etc')).toBe('_/_/etc');
    expect(sanitizeBackupNamespace('..')).toBe('_');
    expect(sanitizeBackupNamespace('.')).toBe('_');
  });

  it('neutralizes separators, drive letters and empty segments', () => {
    expect(sanitizeBackupNamespace('a\\b')).toBe('a_b');
    expect(sanitizeBackupNamespace('C:/Windows')).toBe('C_/Windows');
    expect(sanitizeBackupNamespace('')).toBe('_');
    expect(sanitizeBackupNamespace('//')).toBe('_/_/_');
  });
});

describe('BackupManager', () => {
  let backupRoot: string;
  let remoteRoot: string;
  let transport: LocalTransport;

  beforeEach(async () => {
    backupRoot = await mkdtemp(join(tmpdir(), 'sftps-backup-'));
    remoteRoot = await mkdtemp(join(tmpdir(), 'sftps-remote-'));
    transport = new LocalTransport(remoteRoot);
    await transport.connect();
  });

  afterEach(async () => {
    await rm(backupRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  });

  it('backs up an existing remote file with the injected timestamp', async () => {
    await transport.writeFile('/pub/index.html', Buffer.from('v1'));
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-07-20T01:02:03.004Z') });
    const saved = await mgr.backupExisting(transport, 'prof1', '/pub/index.html');
    expect(saved).not.toBeNull();
    const list = await mgr.listBackups('prof1', '/pub/index.html');
    expect(list).toHaveLength(1);
    expect(list[0].timestamp.toISOString()).toBe('2026-07-20T01:02:03.004Z');
  });

  it('reports the byte size of each generation (shown in the restore confirmation)', async () => {
    await transport.writeFile('/f.txt', Buffer.from('12345'));
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-07-20T00:00:00.000Z') });
    await mgr.backupExisting(transport, 'p', '/f.txt');
    const list = await mgr.listBackups('p', '/f.txt');
    expect(list[0].size).toBe(5);
  });

  it('skips backup (returns null) when the remote file does not exist', async () => {
    const mgr = new BackupManager({ backupRoot });
    const saved = await mgr.backupExisting(transport, 'prof1', '/pub/new.html');
    expect(saved).toBeNull();
    expect(await mgr.listBackups('prof1', '/pub/new.html')).toEqual([]);
  });

  it('rotates out the oldest generation beyond maxGenerations', async () => {
    await transport.writeFile('/f.txt', Buffer.from('a'));
    const times = [
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
    ];
    let i = 0;
    const mgr = new BackupManager({ backupRoot, maxGenerations: 2, now: () => new Date(times[i++]) });
    await mgr.backupExisting(transport, 'p', '/f.txt');
    await mgr.backupExisting(transport, 'p', '/f.txt');
    await mgr.backupExisting(transport, 'p', '/f.txt');
    const list = await mgr.listBackups('p', '/f.txt');
    expect(list.map((b) => b.timestamp.toISOString())).toEqual([
      '2026-01-03T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    ]);
  });

  it('restores the latest backup, and a specific generation by timestamp', async () => {
    const times = ['2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z'];
    let i = 0;
    const mgr = new BackupManager({ backupRoot, now: () => new Date(times[i++]) });
    await transport.writeFile('/f.txt', Buffer.from('first'));
    await mgr.backupExisting(transport, 'p', '/f.txt');
    await transport.writeFile('/f.txt', Buffer.from('second'));
    await mgr.backupExisting(transport, 'p', '/f.txt');

    expect((await mgr.restore('p', '/f.txt')).toString()).toBe('second');
    const older = await mgr.restore('p', '/f.txt', new Date('2026-05-01T00:00:00.000Z'));
    expect(older.toString()).toBe('first');
  });

  it('preserves the original extension in the backup filename', async () => {
    await transport.writeFile('/pub/style.css', Buffer.from('body{}'));
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-07-20T00:00:00.000Z') });
    const saved = await mgr.backupExisting(transport, 'p', '/pub/style.css');
    expect(saved).not.toBeNull();
    expect(saved!.endsWith('.css')).toBe(true);
  });

  it('keeps a traversal-shaped profile id inside the backup root', async () => {
    await transport.writeFile('/f.txt', Buffer.from('a'));
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-07-20T00:00:00.000Z') });
    const saved = await mgr.backupExisting(transport, '../../escaped', '/f.txt');
    expect(saved).not.toBeNull();
    expect(resolve(saved!).startsWith(resolve(backupRoot) + sep)).toBe(true);
  });

  it('still separates the download namespace from the upload one', async () => {
    await transport.writeFile('/f.txt', Buffer.from('a'));
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-07-20T00:00:00.000Z') });
    await mgr.backupExisting(transport, 'p', '/f.txt');
    await mgr.backupExisting(transport, 'p/download', '/f.txt');
    expect(await mgr.listBackups('p', '/f.txt')).toHaveLength(1);
    expect(await mgr.listBackups('p/download', '/f.txt')).toHaveLength(1);
  });

  it('keeps generations for formerly-colliding remote paths separate', async () => {
    const times = ['2026-07-20T00:00:00.000Z', '2026-07-20T00:00:01.000Z'];
    let i = 0;
    const mgr = new BackupManager({ backupRoot, now: () => new Date(times[i++]) });
    await transport.writeFile('/a/b', Buffer.from('nested'));
    await transport.writeFile('/a_b', Buffer.from('flat'));
    await mgr.backupExisting(transport, 'p', '/a/b');
    await mgr.backupExisting(transport, 'p', '/a_b');
    expect((await mgr.restore('p', '/a/b')).toString()).toBe('nested');
    expect((await mgr.restore('p', '/a_b')).toString()).toBe('flat');
  });
});

describe('BackupManager retention policy', () => {
  let backupRoot: string;
  let remoteRoot: string;
  let transport: LocalTransport;

  beforeEach(async () => {
    backupRoot = await mkdtemp(join(tmpdir(), 'sftps-backup-ret-'));
    remoteRoot = await mkdtemp(join(tmpdir(), 'sftps-remote-ret-'));
    transport = new LocalTransport(remoteRoot);
    await transport.connect();
  });

  afterEach(async () => {
    await rm(backupRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  });

  it('drops generations older than maxAgeDays when rotating', async () => {
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const mgr = new BackupManager({ backupRoot, maxAgeDays: 7, now: () => clock });
    await transport.writeFile('/pub/.env', Buffer.from('SECRET=1'));
    await mgr.backupExisting(transport, 'p1', '/pub/.env');

    clock = new Date('2026-01-20T00:00:00.000Z');
    await transport.writeFile('/pub/.env', Buffer.from('SECRET=2'));
    await mgr.backupExisting(transport, 'p1', '/pub/.env');

    const list = await mgr.listBackups('p1', '/pub/.env');
    expect(list).toHaveLength(1);
    expect(list[0].timestamp.toISOString()).toBe('2026-01-20T00:00:00.000Z');
  });

  it('setRetention changes the policy at runtime', async () => {
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const mgr = new BackupManager({ backupRoot, now: () => clock });
    for (const v of ['a', 'b', 'c']) {
      await transport.writeFile('/x.txt', Buffer.from(v));
      await mgr.backupExisting(transport, 'p1', '/x.txt');
      clock = new Date(clock.getTime() + 1000);
    }
    expect(await mgr.listBackups('p1', '/x.txt')).toHaveLength(3);

    mgr.setRetention({ maxGenerations: 1 });
    await transport.writeFile('/x.txt', Buffer.from('d'));
    await mgr.backupExisting(transport, 'p1', '/x.txt');
    expect(await mgr.listBackups('p1', '/x.txt')).toHaveLength(1);
  });

  it('pruneExpired sweeps every namespace, not just the one being written', async () => {
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const mgr = new BackupManager({ backupRoot, now: () => clock });
    await transport.writeFile('/a.txt', Buffer.from('a'));
    await mgr.backupExisting(transport, 'p1', '/a.txt');
    await transport.writeFile('/b.txt', Buffer.from('b'));
    await mgr.backupExisting(transport, 'p2/download', '/b.txt');

    clock = new Date('2026-03-01T00:00:00.000Z');
    mgr.setRetention({ maxAgeDays: 7 });
    expect(await mgr.pruneExpired()).toBe(2);
    expect(await mgr.listBackups('p1', '/a.txt')).toEqual([]);
    expect(await mgr.listBackups('p2/download', '/b.txt')).toEqual([]);
  });

  it('pruneExpired keeps generations inside the policy', async () => {
    const mgr = new BackupManager({ backupRoot, maxAgeDays: 30, now: () => new Date('2026-01-01T00:00:00.000Z') });
    await transport.writeFile('/a.txt', Buffer.from('a'));
    await mgr.backupExisting(transport, 'p1', '/a.txt');
    expect(await mgr.pruneExpired()).toBe(0);
    expect(await mgr.listBackups('p1', '/a.txt')).toHaveLength(1);
  });

  it('purgeNamespace deletes every backup of a profile (upload and download)', async () => {
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-01-01T00:00:00.000Z') });
    await transport.writeFile('/a.txt', Buffer.from('a'));
    await mgr.backupExisting(transport, 'p1', '/a.txt');
    await mgr.backupExisting(transport, 'p1/download', '/a.txt');
    await mgr.backupExisting(transport, 'p2', '/a.txt');

    await mgr.purgeNamespace('p1');
    expect(await mgr.listBackups('p1', '/a.txt')).toEqual([]);
    expect(await mgr.listBackups('p1/download', '/a.txt')).toEqual([]);
    expect(await mgr.listBackups('p2', '/a.txt')).toHaveLength(1);
  });

  it('purgeNamespace is a no-op for an unknown namespace and cannot escape the backup root', async () => {
    const mgr = new BackupManager({ backupRoot, now: () => new Date('2026-01-01T00:00:00.000Z') });
    await transport.writeFile('/a.txt', Buffer.from('a'));
    await mgr.backupExisting(transport, 'p1', '/a.txt');
    await expect(mgr.purgeNamespace('nope')).resolves.toBeUndefined();
    await mgr.purgeNamespace('../..');
    expect(await mgr.listBackups('p1', '/a.txt')).toHaveLength(1);
  });
});
