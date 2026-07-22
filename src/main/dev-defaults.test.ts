import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProfileDefaults } from './dev-defaults';

describe('loadProfileDefaults', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'funabinftp-dev-defaults-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when the .env file does not exist', async () => {
    const result = await loadProfileDefaults(join(dir, '.env'));
    expect(result).toBeNull();
  });

  it('parses non-secret fields from an existing .env file', async () => {
    const envPath = join(dir, '.env');
    await writeFile(
      envPath,
      ['FUNABIN_DEFAULT_PROTOCOL=ftp', 'FUNABIN_DEFAULT_HOST=example.com', 'FUNABIN_DEFAULT_PORT=21'].join(
        '\n',
      ),
      'utf8',
    );
    const result = await loadProfileDefaults(envPath);
    expect(result).toEqual({ protocol: 'ftp', host: 'example.com', port: 21 });
  });

  it('returns null when the file has no recognized default fields', async () => {
    const envPath = join(dir, '.env');
    await writeFile(envPath, 'SOME_UNRELATED_VAR=1\n', 'utf8');
    const result = await loadProfileDefaults(envPath);
    expect(result).toBeNull();
  });
});
