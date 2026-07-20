import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../transport/local-transport';
import { BackupManager, sanitizeRemotePath } from './index';

describe('sanitizeRemotePath', () => {
  it('replaces characters not allowed in Windows file names', () => {
    const s = sanitizeRemotePath('/a:b*c?d"e<f>g|h\\i/j');
    expect(s).not.toMatch(/[\\/:*?"<>|]/);
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
});
