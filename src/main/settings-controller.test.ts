import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from '../core/settings/index';
import { SettingsController } from './settings-controller';

function makeFile(fail = false) {
  const saved: AppSettings[] = [];
  return {
    saved,
    save: async (input: unknown): Promise<AppSettings> => {
      if (fail) throw new Error('disk full');
      const normalized = normalizeSettings(input);
      saved.push(normalized);
      return normalized;
    },
  };
}

describe('SettingsController', () => {
  it('exposes the settings it was created with', () => {
    const controller = new SettingsController(makeFile(), DEFAULT_SETTINGS);
    expect(controller.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists, normalizes and then serves the new settings', async () => {
    const file = makeFile();
    const controller = new SettingsController(file, DEFAULT_SETTINGS);
    const saved = await controller.save({ backup: { maxGenerations: 5, maxAgeDays: 9999 }, diff: { maxBytes: 1 } });

    expect(saved.backup).toEqual({ maxGenerations: 5, maxAgeDays: 3650 });
    expect(saved.diff.maxBytes).toBe(1024);
    expect(controller.get()).toEqual(saved);
    expect(file.saved).toHaveLength(1);
  });

  it('applies the new settings to the running app', async () => {
    const applied: AppSettings[] = [];
    const controller = new SettingsController(makeFile(), DEFAULT_SETTINGS, (s) => applied.push(s));
    const saved = await controller.save({ backup: { maxGenerations: 3, maxAgeDays: 7 } });
    expect(applied).toEqual([saved]);
  });

  it('applyNow pushes the current settings without saving', () => {
    const applied: AppSettings[] = [];
    const file = makeFile();
    new SettingsController(file, DEFAULT_SETTINGS, (s) => applied.push(s)).applyNow();
    expect(applied).toEqual([DEFAULT_SETTINGS]);
    expect(file.saved).toEqual([]);
  });

  it('keeps the previous settings when persisting fails', async () => {
    const controller = new SettingsController(makeFile(true), DEFAULT_SETTINGS);
    await expect(controller.save({ diff: { maxBytes: 4096 } })).rejects.toThrow('disk full');
    expect(controller.get()).toEqual(DEFAULT_SETTINGS);
  });
});
