import { describe, it, expect } from 'vitest';
import {
  translate,
  createTranslator,
  normalizeLocale,
  resolveLocale,
  dictionaries,
  LOCALES,
} from './index';

const sample = {
  ja: { greeting: 'こんにちは {name}', onlyJa: 'ja' },
  en: { greeting: 'Hello {name}', onlyJa: 'en' },
};

describe('translate', () => {
  it('looks up a key and interpolates params', () => {
    expect(translate(sample, 'ja', 'greeting', { name: '太郎' })).toBe('こんにちは 太郎');
    expect(translate(sample, 'en', 'greeting', { name: 'Taro' })).toBe('Hello Taro');
  });

  it('falls back to en, then to the key itself, when missing', () => {
    const partial = { ja: {}, en: { only: 'Only EN' } };
    expect(translate(partial, 'ja', 'only')).toBe('Only EN');
    expect(translate(partial, 'ja', 'nope')).toBe('nope');
  });

  it('createTranslator binds the dictionary and locale', () => {
    const t = createTranslator(sample, 'ja');
    expect(t('greeting', { name: 'X' })).toBe('こんにちは X');
  });
});

describe('normalizeLocale', () => {
  it('reduces region tags to the base language, lowercased', () => {
    expect(normalizeLocale('ja-JP')).toBe('ja');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('JA')).toBe('ja');
    expect(normalizeLocale('en_GB')).toBe('en');
  });
});

describe('resolveLocale', () => {
  it('returns the normalized locale if supported, else the fallback', () => {
    expect(resolveLocale('ja-JP', LOCALES, 'en')).toBe('ja');
    expect(resolveLocale('en-US', LOCALES, 'ja')).toBe('en');
    expect(resolveLocale('fr-FR', LOCALES, 'ja')).toBe('ja');
  });
});

describe('dictionary integrity', () => {
  it('ja and en have exactly the same set of keys', () => {
    const jaKeys = Object.keys(dictionaries.ja).sort();
    const enKeys = Object.keys(dictionaries.en).sort();
    expect(jaKeys).toEqual(enKeys);
  });
});
