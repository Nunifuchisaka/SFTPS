import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  serializeSettings,
  parseSettings,
} from './index';

describe('DEFAULT_SETTINGS', () => {
  it('keeps the previous behaviour as the default (20 generations, unlimited age, 1MB diff, no extension filter)', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      backup: { maxGenerations: 20, maxAgeDays: null },
      diff: { maxBytes: 1024 * 1024 },
      uploadExtensionFilter: { enabled: false, extensions: [] },
    });
  });
});

describe('normalizeSettings', () => {
  it('fills in every missing field with the default', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const s = normalizeSettings({
      backup: { maxGenerations: 5, maxAgeDays: 30 },
      diff: { maxBytes: 65536 },
      uploadExtensionFilter: { enabled: true, extensions: ['jpg', 'PNG'] },
    });
    expect(s).toEqual({
      backup: { maxGenerations: 5, maxAgeDays: 30 },
      diff: { maxBytes: 65536 },
      uploadExtensionFilter: { enabled: true, extensions: ['jpg', 'png'] },
    });
  });

  it('defaults the extension filter to disabled and empty when missing or malformed', () => {
    expect(normalizeSettings({}).uploadExtensionFilter).toEqual({ enabled: false, extensions: [] });
    expect(
      normalizeSettings({ uploadExtensionFilter: { enabled: 'yes', extensions: 'jpg' } })
        .uploadExtensionFilter,
    ).toEqual({ enabled: false, extensions: [] });
  });

  it('clamps the generation cap into 1..1000', () => {
    expect(normalizeSettings({ backup: { maxGenerations: 0 } }).backup.maxGenerations).toBe(1);
    expect(normalizeSettings({ backup: { maxGenerations: -5 } }).backup.maxGenerations).toBe(1);
    expect(normalizeSettings({ backup: { maxGenerations: 99999 } }).backup.maxGenerations).toBe(1000);
    expect(normalizeSettings({ backup: { maxGenerations: 3.7 } }).backup.maxGenerations).toBe(3);
  });

  it('treats a non-positive or unusable retention period as unlimited', () => {
    expect(normalizeSettings({ backup: { maxAgeDays: 0 } }).backup.maxAgeDays).toBeNull();
    expect(normalizeSettings({ backup: { maxAgeDays: -1 } }).backup.maxAgeDays).toBeNull();
    expect(normalizeSettings({ backup: { maxAgeDays: 'x' } }).backup.maxAgeDays).toBeNull();
    expect(normalizeSettings({ backup: { maxAgeDays: null } }).backup.maxAgeDays).toBeNull();
  });

  it('caps the retention period at 3650 days', () => {
    expect(normalizeSettings({ backup: { maxAgeDays: 99999 } }).backup.maxAgeDays).toBe(3650);
  });

  it('clamps the diff limit into 1KiB..64MiB', () => {
    expect(normalizeSettings({ diff: { maxBytes: 1 } }).diff.maxBytes).toBe(1024);
    expect(normalizeSettings({ diff: { maxBytes: 1024 * 1024 * 1024 } }).diff.maxBytes).toBe(
      64 * 1024 * 1024,
    );
    expect(normalizeSettings({ diff: { maxBytes: 'x' } }).diff.maxBytes).toBe(1024 * 1024);
  });

  it('drops unknown fields (whitelist rebuild)', () => {
    const s = normalizeSettings({ backup: { maxGenerations: 3, evil: 1 }, extra: true });
    expect(s).not.toHaveProperty('extra');
    expect(s.backup).not.toHaveProperty('evil');
  });
});

describe('serializeSettings / parseSettings', () => {
  it('round-trips settings', () => {
    const s = normalizeSettings({ backup: { maxGenerations: 7, maxAgeDays: 14 }, diff: { maxBytes: 2048 } });
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('falls back to the defaults for a broken payload', () => {
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
  });
});
