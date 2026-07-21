import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '../core/settings/index';
import { SettingsFile } from './settings-store';

describe('SettingsFile', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-settings-'));
    file = join(dir, 'settings.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the defaults when the file does not exist yet', async () => {
    expect(await new SettingsFile(file).load()).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and reads settings back', async () => {
    const store = new SettingsFile(file);
    const saved = await store.save({
      backup: { maxGenerations: 5, maxAgeDays: 14 },
      diff: { maxBytes: 4096 },
    });
    expect(saved).toEqual({ backup: { maxGenerations: 5, maxAgeDays: 14 }, diff: { maxBytes: 4096 } });
    expect(await new SettingsFile(file).load()).toEqual(saved);
    expect(await readFile(file, 'utf8')).toContain('maxAgeDays');
  });

  it('normalizes out-of-range values before persisting them', async () => {
    const saved = await new SettingsFile(file).save({
      backup: { maxGenerations: -1, maxAgeDays: 0 },
      diff: { maxBytes: 1 },
    });
    expect(saved.backup).toEqual({ maxGenerations: 1, maxAgeDays: null });
    expect(saved.diff.maxBytes).toBe(1024);
  });

  it('falls back to the defaults for a corrupted file (settings hold no secrets)', async () => {
    await writeFile(file, '{ broken', 'utf8');
    expect(await new SettingsFile(file).load()).toEqual(DEFAULT_SETTINGS);
  });
});
