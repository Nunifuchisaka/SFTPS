import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic-write';

describe('writeFileAtomic', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-atomic-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the content to the target path', async () => {
    const file = join(dir, 'data.json');
    await writeFileAtomic(file, '{"a":1}');
    expect(await readFile(file, 'utf8')).toBe('{"a":1}');
  });

  it('creates missing parent directories', async () => {
    const file = join(dir, 'nested', 'deep', 'data.json');
    await writeFileAtomic(file, 'x');
    expect(await readFile(file, 'utf8')).toBe('x');
  });

  it('leaves no temporary file behind', async () => {
    const file = join(dir, 'data.json');
    await writeFileAtomic(file, 'x');
    expect(await readdir(dir)).toEqual(['data.json']);
  });

  it('fully replaces existing content (no truncation leftovers)', async () => {
    const file = join(dir, 'data.json');
    await writeFile(file, 'a'.repeat(500), 'utf8');
    await writeFileAtomic(file, 'short');
    expect(await readFile(file, 'utf8')).toBe('short');
  });

  it('restricts the file to the owner (0600) on POSIX', async () => {
    const file = join(dir, 'data.json');
    await writeFileAtomic(file, 'secret');
    if (process.platform === 'win32') return; // Windows は POSIX モードを持たない
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('keeps the previous content when writing fails', async () => {
    const file = join(dir, 'data.json');
    await writeFileAtomic(file, 'original');
    // ディレクトリを対象にすると temp への書き込み自体は成功し rename で失敗する。
    await expect(writeFileAtomic(dir, 'boom')).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('original');
  });
});
