import { describe, it, expect } from 'vitest';
import {
  normalizeExtensionList,
  extensionOf,
  hasAllowedExtension,
  isUploadAllowed,
} from './extension-filter';

describe('normalizeExtensionList', () => {
  it('lower-cases and strips a leading dot', () => {
    expect(normalizeExtensionList(['.JPG', 'Png'])).toEqual(['jpg', 'png']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(normalizeExtensionList([' jpg ', '', '  '])).toEqual(['jpg']);
  });

  it('deduplicates', () => {
    expect(normalizeExtensionList(['jpg', 'JPG', '.jpg'])).toEqual(['jpg']);
  });

  it('drops entries with disallowed characters', () => {
    expect(normalizeExtensionList(['jpg', 'a/b', 'a*b', 'ok-1_2'])).toEqual(['jpg', 'ok-1_2']);
  });

  it('falls back to an empty list for non-array input', () => {
    expect(normalizeExtensionList(undefined)).toEqual([]);
    expect(normalizeExtensionList('jpg')).toEqual([]);
    expect(normalizeExtensionList(null)).toEqual([]);
  });

  it('caps the number of extensions', () => {
    const many = Array.from({ length: 100 }, (_, i) => `ext${i}`);
    expect(normalizeExtensionList(many).length).toBe(50);
  });
});

describe('extensionOf', () => {
  it('returns the lower-cased extension without the dot', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns empty string when there is no extension', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
  });
});

describe('hasAllowedExtension', () => {
  it('allows everything when the extension list is empty', () => {
    expect(hasAllowedExtension('a.exe', [])).toBe(true);
  });

  it('matches case-insensitively against the normalized list', () => {
    expect(hasAllowedExtension('photo.JPG', ['jpg', 'png'])).toBe(true);
    expect(hasAllowedExtension('script.exe', ['jpg', 'png'])).toBe(false);
  });
});

describe('isUploadAllowed', () => {
  it('allows everything when the filter is disabled', () => {
    expect(isUploadAllowed('script.exe', { enabled: false, extensions: ['jpg'] })).toBe(true);
  });

  it('delegates to hasAllowedExtension when enabled', () => {
    expect(isUploadAllowed('photo.jpg', { enabled: true, extensions: ['jpg'] })).toBe(true);
    expect(isUploadAllowed('script.exe', { enabled: true, extensions: ['jpg'] })).toBe(false);
  });
});
