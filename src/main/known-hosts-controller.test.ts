import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnownHostsFile } from './known-hosts-store';
import { KnownHostsController } from './known-hosts-controller';
import { KnownHostsStore } from '../core/hostkey/index';

const FP_A = 'SHA256:AAA';
const FP_B = 'SHA256:BBB';

describe('KnownHostsController', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-khc-'));
    filePath = join(dir, 'known_hosts.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function open(path = filePath): Promise<KnownHostsController> {
    const file = new KnownHostsFile(path);
    return new KnownHostsController(file, await file.load());
  }

  it('starts empty and lists what has been trusted', async () => {
    const c = await open();
    expect(c.list()).toEqual([]);
    await c.trust('a.example', 22, FP_A);
    expect(c.list()).toEqual([{ host: 'a.example', port: 22, fingerprint: FP_A }]);
  });

  it('persists trust so a later run sees it', async () => {
    await (await open()).trust('a.example', 22, FP_A);
    expect((await open()).list()).toEqual([{ host: 'a.example', port: 22, fingerprint: FP_A }]);
  });

  it('verifies against what is currently trusted', async () => {
    const c = await open();
    expect(c.verify('a.example', 22, FP_A)).toBe('unknown');
    await c.trust('a.example', 22, FP_A);
    expect(c.verify('a.example', 22, FP_A)).toBe('trusted');
    expect(c.verify('a.example', 22, FP_B)).toBe('mismatch');
    expect(c.lookup('a.example', 22)).toBe(FP_A);
  });

  it('removes an entry and persists the removal (re-trust path after a legit rekey)', async () => {
    const c = await open();
    await c.trust('a.example', 22, FP_A);
    expect(await c.remove('a.example', 22)).toBe(true);
    expect(c.list()).toEqual([]);
    expect((await open()).list()).toEqual([]);
  });

  it('reports false and writes nothing when removing an unknown host', async () => {
    const c = await open();
    expect(await c.remove('nope.example', 22)).toBe(false);
  });

  it('after removal the host is unknown again (so the next connect asks)', async () => {
    const c = await open();
    await c.trust('a.example', 22, FP_A);
    await c.remove('a.example', 22);
    expect(c.verify('a.example', 22, FP_B)).toBe('unknown');
  });

  it('does not swallow a save failure', async () => {
    // ディレクトリを保存先にすると rename に失敗する（読み込みは通らないので直接組み立てる）。
    const c = new KnownHostsController(new KnownHostsFile(dir), new KnownHostsStore());
    await expect(c.trust('a.example', 22, FP_A)).rejects.toThrow();
  });
});
