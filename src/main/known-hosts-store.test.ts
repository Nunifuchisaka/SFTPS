import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnownHostsFile, KnownHostsLoadError } from './known-hosts-store';
import { KnownHostsStore } from '../core/hostkey/index';

const FP_A = 'SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('KnownHostsFile.load', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-known-'));
    filePath = join(dir, 'known_hosts.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts empty on first run (file does not exist yet)', async () => {
    const store = await new KnownHostsFile(filePath).load();
    expect(store.list()).toEqual([]);
  });

  it('loads previously trusted hosts', async () => {
    const file = new KnownHostsFile(filePath);
    const store = new KnownHostsStore();
    store.add('a.example', 22, FP_A);
    await file.save(store);
    expect((await file.load()).list()).toEqual([{ host: 'a.example', port: 22, fingerprint: FP_A }]);
  });

  it('fails closed on a corrupted file instead of silently dropping all pins', async () => {
    await writeFile(filePath, '{ this is not json', 'utf8');
    await expect(new KnownHostsFile(filePath).load()).rejects.toBeInstanceOf(KnownHostsLoadError);
  });

  it('fails closed when the JSON shape is wrong', async () => {
    await writeFile(filePath, '["not", "an", "object"]', 'utf8');
    await expect(new KnownHostsFile(filePath).load()).rejects.toBeInstanceOf(KnownHostsLoadError);
  });

  it('fails closed on a read error that is not ENOENT', async () => {
    // ディレクトリを known_hosts.json の位置に置くと readFile は ENOENT 以外で失敗する。
    const asDir = join(dir, 'as-dir');
    await new KnownHostsFile(join(asDir, 'known_hosts.json')).save(new KnownHostsStore());
    await expect(new KnownHostsFile(asDir).load()).rejects.toBeInstanceOf(KnownHostsLoadError);
  });

  it('reports the offending file path without leaking contents', async () => {
    await writeFile(filePath, 'SECRETISH-GARBAGE', 'utf8');
    const error = await new KnownHostsFile(filePath).load().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KnownHostsLoadError);
    expect((error as KnownHostsLoadError).filePath).toBe(filePath);
    expect((error as KnownHostsLoadError).message).not.toContain('SECRETISH-GARBAGE');
  });
});

describe('KnownHostsFile.save', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-known-'));
    filePath = join(dir, 'known_hosts.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes atomically, leaving no temporary files', async () => {
    const store = new KnownHostsStore();
    store.add('a.example', 22, FP_A);
    await new KnownHostsFile(filePath).save(store);
    expect(await readdir(dir)).toEqual(['known_hosts.json']);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ 'a.example:22': FP_A });
  });

  it('restricts the file to the owner on POSIX', async () => {
    await new KnownHostsFile(filePath).save(new KnownHostsStore());
    if (process.platform === 'win32') return;
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});
