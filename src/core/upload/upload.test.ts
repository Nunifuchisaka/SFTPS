import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile as fsWriteFile, readFile as fsReadFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../transport/local-transport';
import { BackupManager } from '../backup/index';
import { prepareUpload, commitUpload } from './index';

describe('upload coordinator (integration, real file I/O)', () => {
  let localDir: string;
  let remoteDir: string;
  let backupDir: string;
  let transport: LocalTransport;

  beforeEach(async () => {
    localDir = await mkdtemp(join(tmpdir(), 'sftps-up-local-'));
    remoteDir = await mkdtemp(join(tmpdir(), 'sftps-up-remote-'));
    backupDir = await mkdtemp(join(tmpdir(), 'sftps-up-backup-'));
    transport = new LocalTransport(remoteDir);
    await transport.connect();
  });

  afterEach(async () => {
    await rm(localDir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
  });

  it('prepareUpload flags a brand-new remote file', async () => {
    const localPath = join(localDir, 'new.txt');
    await fsWriteFile(localPath, Buffer.from('hello', 'utf8'));

    const preview = await prepareUpload(transport, localPath, '/dir/new.txt');
    expect(preview.isNew).toBe(true);
    expect(preview.binary).toBe(false);
    expect(preview.afterSize).toBe(5);
    expect(preview.segments).toBeUndefined();
  });

  it('prepareUpload returns character diff segments for an existing text file', async () => {
    await transport.writeFile('/site/page.html', Buffer.from('abc', 'utf8'));
    const localPath = join(localDir, 'page.html');
    await fsWriteFile(localPath, Buffer.from('axc', 'utf8'));

    const preview = await prepareUpload(transport, localPath, '/site/page.html');
    expect(preview.isNew).toBe(false);
    expect(preview.binary).toBe(false);
    expect(preview.beforeSize).toBe(3);
    expect(preview.afterSize).toBe(3);
    expect(preview.summary).toEqual({ added: 1, removed: 1 });
    expect(preview.segments).toContainEqual({ type: 'added', value: 'x' });
  });

  it('prepareUpload falls back to size info for binary content', async () => {
    await transport.writeFile('/img.bin', Buffer.from([0x00, 0x01, 0x02]));
    const localPath = join(localDir, 'img.bin');
    await fsWriteFile(localPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const preview = await prepareUpload(transport, localPath, '/img.bin');
    expect(preview.binary).toBe(true);
    expect(preview.beforeSize).toBe(3);
    expect(preview.afterSize).toBe(4);
    expect(preview.segments).toBeUndefined();
  });

  it('commitUpload skips backup for a new file and writes the content', async () => {
    const localPath = join(localDir, 'fresh.txt');
    await fsWriteFile(localPath, Buffer.from('fresh', 'utf8'));
    const mgr = new BackupManager({ backupRoot: backupDir });

    const result = await commitUpload(transport, mgr, 'p1', localPath, '/fresh.txt');
    expect(result.backupPath).toBeNull();
    expect(result.bytesWritten).toBe(5);
    expect((await transport.readFile('/fresh.txt')).toString('utf8')).toBe('fresh');
  });

  it('commitUpload backs up the old remote file before overwriting it', async () => {
    await transport.writeFile('/f.txt', Buffer.from('OLD', 'utf8'));
    const localPath = join(localDir, 'f.txt');
    await fsWriteFile(localPath, Buffer.from('NEW', 'utf8'));
    const mgr = new BackupManager({ backupRoot: backupDir, now: () => new Date('2026-07-20T09:00:00.000Z') });

    const result = await commitUpload(transport, mgr, 'p1', localPath, '/f.txt');
    expect(result.backupPath).not.toBeNull();
    expect((await fsReadFile(result.backupPath as string)).toString('utf8')).toBe('OLD');
    expect((await transport.readFile('/f.txt')).toString('utf8')).toBe('NEW');
    expect(await mgr.listBackups('p1', '/f.txt')).toHaveLength(1);
  });

  it('commitUpload verifies integrity after transfer when requested', async () => {
    const localPath = join(localDir, 'v.txt');
    await fsWriteFile(localPath, Buffer.from('verify-me', 'utf8'));
    const mgr = new BackupManager({ backupRoot: backupDir });

    const result = await commitUpload(transport, mgr, 'p1', localPath, '/v.txt', {
      verifyAfterTransfer: true,
    });
    expect(result.verified).toBe(true);
    expect((await transport.readFile('/v.txt')).toString('utf8')).toBe('verify-me');
  });
});

describe('prepareUpload diff size limit', () => {
  let localDir: string;
  let remoteDir: string;
  let transport: LocalTransport;

  beforeEach(async () => {
    localDir = await mkdtemp(join(tmpdir(), 'sftps-up-lim-local-'));
    remoteDir = await mkdtemp(join(tmpdir(), 'sftps-up-lim-remote-'));
    transport = new LocalTransport(remoteDir);
    await transport.connect();
  });

  afterEach(async () => {
    await rm(localDir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
  });

  it('falls back to a size comparison when the file is over the limit', async () => {
    const localPath = join(localDir, 'big.txt');
    await fsWriteFile(localPath, Buffer.from('b'.repeat(50), 'utf8'));
    await transport.writeFile('/big.txt', Buffer.from('a'.repeat(40), 'utf8'));

    const preview = await prepareUpload(transport, localPath, '/big.txt', { maxDiffBytes: 30 });
    expect(preview.tooLarge).toBe(true);
    expect(preview.diffLimitBytes).toBe(30);
    expect(preview.beforeSize).toBe(40);
    expect(preview.afterSize).toBe(50);
    expect(preview.segments).toBeUndefined();
    expect(preview.binary).toBe(false);
  });

  it('still produces a character diff under the limit', async () => {
    const localPath = join(localDir, 'small.txt');
    await fsWriteFile(localPath, Buffer.from('axc', 'utf8'));
    await transport.writeFile('/small.txt', Buffer.from('abc', 'utf8'));

    const preview = await prepareUpload(transport, localPath, '/small.txt', { maxDiffBytes: 1000 });
    expect(preview.tooLarge).toBeFalsy();
    expect(preview.summary).toEqual({ added: 1, removed: 1 });
  });
});
