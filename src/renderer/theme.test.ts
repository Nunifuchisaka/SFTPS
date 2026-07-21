// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyTheme } from './theme';

describe('applyTheme', () => {
  it('sets data-theme on the element and returns the resolved theme', () => {
    const el = document.createElement('div');
    expect(applyTheme(el, 'dark', false)).toBe('dark');
    expect(el.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves system against the prefers-dark flag', () => {
    const el = document.createElement('div');
    expect(applyTheme(el, 'system', true)).toBe('dark');
    expect(el.getAttribute('data-theme')).toBe('dark');
    expect(applyTheme(el, 'system', false)).toBe('light');
    expect(el.getAttribute('data-theme')).toBe('light');
  });
});
