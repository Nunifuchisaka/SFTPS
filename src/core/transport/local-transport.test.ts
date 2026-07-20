import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile as fsWriteFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from './local-transport';

describe('LocalTransport', () => {
  let root: string;
  let t: LocalTransport;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sftps-local-'));
    t = new LocalTransport(root);
    await t.connect();
  });

  afterEach(async () => {
    await t.disconnect();
    await rm(root, { recursive: true, force: true });
  });

  it('writeFile then readFile round-trips a Buffer, creating parent dirs', async () => {
    const data = Buffer.from('こんにちは world', 'utf8');
    await t.writeFile('/sub/dir/hello.txt', data);
    const read = await t.readFile('/sub/dir/hello.txt');
    expect(read.equals(data)).toBe(true);
  });

  it('list returns files and dirs with name, path, type, size', async () => {
    await mkdir(join(root, 'docs'));
    await fsWriteFile(join(root, 'a.txt'), Buffer.from('12345'));
    const entries = await t.list('/');
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
    expect(byName['a.txt'].type).toBe('file');
    expect(byName['a.txt'].size).toBe(5);
    expect(byName['a.txt'].path).toBe('/a.txt');
    expect(byName['docs'].type).toBe('dir');
    expect(byName['docs'].path).toBe('/docs');
  });

  it('exists returns true for existing path and false otherwise', async () => {
    await t.writeFile('/x.txt', Buffer.from('x'));
    expect(await t.exists('/x.txt')).toBe(true);
    expect(await t.exists('/nope.txt')).toBe(false);
  });

  it('mkdir creates a directory', async () => {
    await t.mkdir('/newdir');
    const entries = await t.list('/');
    expect(entries.some((e) => e.name === 'newdir' && e.type === 'dir')).toBe(true);
  });

  it('delete removes a file', async () => {
    await t.writeFile('/gone.txt', Buffer.from('bye'));
    await t.delete('/gone.txt');
    expect(await t.exists('/gone.txt')).toBe(false);
  });

  it('rejects path traversal outside the root', async () => {
    await expect(t.readFile('/../escape.txt')).rejects.toThrow();
  });
});
