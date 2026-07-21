import { describe, it, expect } from 'vitest';
import { resolveTheme, normalizeThemeSetting } from './index';

describe('resolveTheme', () => {
  it('returns the explicit theme for light and dark', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS preference for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('normalizeThemeSetting', () => {
  it('keeps valid settings', () => {
    expect(normalizeThemeSetting('light')).toBe('light');
    expect(normalizeThemeSetting('dark')).toBe('dark');
    expect(normalizeThemeSetting('system')).toBe('system');
  });

  it('falls back to system for invalid or missing values', () => {
    expect(normalizeThemeSetting('bogus')).toBe('system');
    expect(normalizeThemeSetting(null)).toBe('system');
  });

  it('stays consistent when a persisted value is normalized then resolved', () => {
    const setting = normalizeThemeSetting('bogus'); // -> system
    expect(resolveTheme(setting, true)).toBe('dark');
    expect(resolveTheme(setting, false)).toBe('light');
  });
});
