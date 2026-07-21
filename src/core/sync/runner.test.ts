import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../transport/index';
import { BackupManager } from '../backup/index';
import { walkTree } from './walk';
import { planSync } from './planner';
import { runSync } from './runner';

describe('runSync (integration, two LocalTransports, no mocks)', () => {
  let dir: string;
  let srcRoot: string;
  let dstRoot: string;
  let backupRoot: string;
  let source: LocalTransport;
  let dest: LocalTransport;
  let backupManager: BackupManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-sync-'));
    srcRoot = join(dir, 'src');
    dstRoot = join(dir, 'dst');
    backupRoot = join(dir, 'backups');
    source = new LocalTransport(srcRoot);
    dest = new LocalTransport(dstRoot);
    await source.connect();
    await dest.connect();
    backupManager = new BackupManager({ backupRoot });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uploads new/changed files, backs up overwrites, creates dirs, and skips unchanged', async () => {
    // source tree
    await writeFile(join(srcRoot, 'a.txt'), Buffer.from('NEWDATA'));
    await writeFile(join(srcRoot, 'same.txt'), Buffer.from('same'));
    await mkdir(join(srcRoot, 'sub'));
    await writeFile(join(srcRoot, 'sub', 'b.txt'), Buffer.from('bb'));
    // dest pre-existing
    await writeFile(join(dstRoot, 'a.txt'), Buffer.from('OLD'));
    await writeFile(join(dstRoot, 'same.txt'), Buffer.from('same'));

    const sourceEntries = await walkTree(source, '/');
    const destEntries = await walkTree(dest, '/');
    const plan = planSync(sourceEntries, destEntries, { compareBy: 'size' });

    const result = await runSync(source, dest, plan, { backupManager, profileId: 'p1' });

    expect((await dest.readFile('/a.txt')).toString()).toBe('NEWDATA');
    expect((await dest.readFile('/sub/b.txt')).toString()).toBe('bb');
    expect((await dest.readFile('/same.txt')).toString()).toBe('same');

    // overwrite of a.txt was backed up (old content), same.txt (skipped) was not
    const aBackups = await backupManager.listBackups('p1', '/a.txt');
    expect(aBackups).toHaveLength(1);
    expect((await backupManager.restore('p1', '/a.txt')).toString()).toBe('OLD');
    expect(await backupManager.listBackups('p1', '/same.txt')).toHaveLength(0);

    expect(result).toMatchObject({ uploaded: 2, createdDirs: 1, skipped: 1, deleted: 0 });
  });

  it('deletes extraneous dest files when the plan includes delete-extra', async () => {
    await writeFile(join(srcRoot, 'keep.txt'), Buffer.from('keep'));
    await writeFile(join(dstRoot, 'keep.txt'), Buffer.from('keep'));
    await writeFile(join(dstRoot, 'extra.txt'), Buffer.from('bye'));

    const plan = planSync(await walkTree(source, '/'), await walkTree(dest, '/'), {
      compareBy: 'size',
      deleteExtraneous: true,
    });
    const result = await runSync(source, dest, plan, { backupManager, profileId: 'p1' });

    expect(await dest.exists('/extra.txt')).toBe(false);
    expect(result.deleted).toBe(1);
  });

  it('backs up an extraneous file before deleting it', async () => {
    await writeFile(join(srcRoot, 'keep.txt'), Buffer.from('keep'));
    await writeFile(join(dstRoot, 'keep.txt'), Buffer.from('keep'));
    await writeFile(join(dstRoot, 'extra.txt'), Buffer.from('bye'));

    const plan = planSync(await walkTree(source, '/'), await walkTree(dest, '/'), {
      compareBy: 'size',
      deleteExtraneous: true,
    });
    const result = await runSync(source, dest, plan, { backupManager, profileId: 'p1' });

    expect(await dest.exists('/extra.txt')).toBe(false);
    const backups = await backupManager.listBackups('p1', '/extra.txt');
    expect(backups).toHaveLength(1);
    expect((await backupManager.restore('p1', '/extra.txt')).toString()).toBe('bye');
    expect(result.backups).toContain(backups[0].path);
  });

  it('does nothing when the signal is already aborted', async () => {
    await writeFile(join(srcRoot, 'a.txt'), Buffer.from('a'));
    const plan = planSync(await walkTree(source, '/'), await walkTree(dest, '/'));
    const controller = new AbortController();
    controller.abort();

    const result = await runSync(source, dest, plan, {
      backupManager,
      profileId: 'p1',
      signal: controller.signal,
    });

    expect(result.uploaded).toBe(0);
    expect(result.canceled).toBe(true);
    expect(await dest.exists('/a.txt')).toBe(false);
  });

  it('stops at the next file boundary once aborted mid-run', async () => {
    for (const name of ['a.txt', 'b.txt', 'c.txt']) {
      await writeFile(join(srcRoot, name), Buffer.from(name));
    }
    const plan = planSync(await walkTree(source, '/'), await walkTree(dest, '/'));
    const controller = new AbortController();
    // 1 ファイル読み終えた時点でキャンセル要求が入る状況を作る。
    const abortingSource = Object.create(source) as typeof source;
    abortingSource.readFile = async (p: string) => {
      const data = await source.readFile(p);
      controller.abort();
      return data;
    };

    const result = await runSync(abortingSource, dest, plan, {
      backupManager,
      profileId: 'p1',
      signal: controller.signal,
    });

    expect(result.uploaded).toBe(1);
    expect(result.canceled).toBe(true);
    expect((await dest.list('/')).map((e) => e.name)).toEqual(['a.txt']);
  });

  it('skips pending mirror deletions when aborted', async () => {
    await writeFile(join(dstRoot, 'extra.txt'), Buffer.from('bye'));
    const plan = planSync(await walkTree(source, '/'), await walkTree(dest, '/'), {
      deleteExtraneous: true,
    });
    const controller = new AbortController();
    controller.abort();

    const result = await runSync(source, dest, plan, {
      backupManager,
      profileId: 'p1',
      signal: controller.signal,
    });

    expect(result.deleted).toBe(0);
    expect(await dest.exists('/extra.txt')).toBe(true);
  });

  it('backs up files inside an extraneous directory before removing the directory', async () => {
    await mkdir(join(dstRoot, 'old'));
    await writeFile(join(dstRoot, 'old', 'x.txt'), Buffer.from('inside'));

    const plan = planSync(await walkTree(source, '/'), await walkTree(dest, '/'), {
      compareBy: 'size',
      deleteExtraneous: true,
    });
    const result = await runSync(source, dest, plan, { backupManager, profileId: 'p1' });

    expect(await dest.exists('/old')).toBe(false);
    expect((await backupManager.restore('p1', '/old/x.txt')).toString()).toBe('inside');
    expect(result.deleted).toBe(2);
  });
});
