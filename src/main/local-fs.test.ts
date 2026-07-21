import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLocalDirectory } from './local-fs';

describe('isLocalDirectory', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-localfs-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns true for a directory', async () => {
    expect(await isLocalDirectory(dir)).toBe(true);
  });

  it('returns false for a file', async () => {
    const file = join(dir, 'a.txt');
    await writeFile(file, 'x', 'utf8');
    expect(await isLocalDirectory(file)).toBe(false);
  });

  it('returns false for a missing path', async () => {
    expect(await isLocalDirectory(join(dir, 'missing'))).toBe(false);
  });
});
