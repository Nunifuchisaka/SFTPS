import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTransport } from '../transport/index';
import { walkTree } from './walk';

describe('walkTree', () => {
  let root: string;
  let t: LocalTransport;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sftps-walk-'));
    t = new LocalTransport(root);
    await t.connect();
    await writeFile(join(root, 'a.txt'), Buffer.from('aaa'));
    await mkdir(join(root, 'sub', 'deep'), { recursive: true });
    await writeFile(join(root, 'sub', 'b.txt'), Buffer.from('bb'));
    await writeFile(join(root, 'sub', 'deep', 'c.txt'), Buffer.from('c'));
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'node_modules', 'x.txt'), Buffer.from('x'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('recursively lists files and dirs with base-relative paths', async () => {
    const entries = await walkTree(t, '/');
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
    expect(Object.keys(byPath).sort()).toEqual(['a.txt', 'sub', 'sub/b.txt', 'sub/deep', 'sub/deep/c.txt']);
    expect(byPath['a.txt'].type).toBe('file');
    expect(byPath['a.txt'].size).toBe(3);
    expect(byPath['sub'].type).toBe('dir');
  });

  it('excludes ignored directories (node_modules) and does not recurse into them', async () => {
    const entries = await walkTree(t, '/');
    expect(entries.some((e) => e.path.includes('node_modules'))).toBe(false);
  });

  it('yields a directory before its children', async () => {
    const entries = await walkTree(t, '/');
    const paths = entries.map((e) => e.path);
    expect(paths.indexOf('sub')).toBeLessThan(paths.indexOf('sub/b.txt'));
    expect(paths.indexOf('sub/deep')).toBeLessThan(paths.indexOf('sub/deep/c.txt'));
  });
});
