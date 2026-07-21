import { describe, it, expect } from 'vitest';
import {
  diffChars,
  isBinary,
  stripBom,
  summarize,
  diffContent,
  DEFAULT_MAX_DIFF_BYTES,
} from './index';

describe('diffChars', () => {
  it('diffs at the character level', () => {
    expect(diffChars('abc', 'axc')).toEqual([
      { type: 'equal', value: 'a' },
      { type: 'removed', value: 'b' },
      { type: 'added', value: 'x' },
      { type: 'equal', value: 'c' },
    ]);
  });

  it('shows a CRLF/LF newline difference (bare CR added)', () => {
    const segments = diffChars('a\nb', 'a\r\nb');
    expect(segments).toContainEqual({ type: 'added', value: '\r' });
  });
});

describe('isBinary', () => {
  it('returns true when a NUL byte is present', () => {
    expect(isBinary(Buffer.from([0x48, 0x00, 0x49]))).toBe(true);
  });

  it('returns false for UTF-8 text (including multibyte)', () => {
    expect(isBinary(Buffer.from('日本語 text', 'utf8'))).toBe(false);
  });
});

describe('stripBom', () => {
  it('strips a UTF-8 BOM from a Buffer', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi', 'utf8')]);
    expect(stripBom(withBom)).toBe('hi');
  });

  it('strips a leading U+FEFF from a string', () => {
    expect(stripBom('﻿hi')).toBe('hi');
  });

  it('leaves content without a BOM unchanged', () => {
    expect(stripBom(Buffer.from('plain', 'utf8'))).toBe('plain');
    expect(stripBom('plain')).toBe('plain');
  });
});

describe('summarize', () => {
  it('counts added and removed characters', () => {
    expect(summarize(diffChars('abc', 'axc'))).toEqual({ added: 1, removed: 1 });
  });
});

describe('diffContent', () => {
  it('returns character segments and a summary for text', () => {
    const result = diffContent(Buffer.from('abc', 'utf8'), Buffer.from('axc', 'utf8'));
    expect(result.binary).toBe(false);
    if (!result.binary && !result.tooLarge) {
      expect(result.summary).toEqual({ added: 1, removed: 1 });
      expect(result.segments).toContainEqual({ type: 'added', value: 'x' });
    }
  });

  it('strips a BOM before diffing text so the BOM is not reported as a change', () => {
    const before = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf8')]);
    const after = Buffer.from('hello', 'utf8');
    const result = diffContent(before, after);
    expect(result.binary).toBe(false);
    if (!result.binary && !result.tooLarge) {
      expect(result.summary).toEqual({ added: 0, removed: 0 });
    }
  });

  it('falls back to size comparison for binary content (no char diff)', () => {
    const before = Buffer.from([0x00, 0x01, 0x02]);
    const after = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const result = diffContent(before, after);
    expect(result.binary).toBe(true);
    if (result.binary) {
      expect(result.beforeSize).toBe(3);
      expect(result.afterSize).toBe(4);
    }
  });
});

describe('diffContent size limit (DoS guard)', () => {
  const big = (size: number, fill = 'a') => Buffer.from(fill.repeat(size), 'utf8');

  it('exposes a 1MB default limit', () => {
    expect(DEFAULT_MAX_DIFF_BYTES).toBe(1024 * 1024);
  });

  it('skips the character diff when either side exceeds the limit', () => {
    const result = diffContent(big(10), big(20, 'b'), { maxBytes: 15 });
    expect(result.binary).toBe(false);
    expect(result.tooLarge).toBe(true);
    if (!result.binary && result.tooLarge) {
      expect(result.beforeSize).toBe(10);
      expect(result.afterSize).toBe(20);
      expect(result.limitBytes).toBe(15);
    }
  });

  it('still diffs content that is exactly at the limit', () => {
    const result = diffContent(big(8), big(8, 'b'), { maxBytes: 8 });
    expect(result.tooLarge).toBe(false);
    if (!result.binary && !result.tooLarge) {
      expect(result.summary).toEqual({ added: 8, removed: 8 });
    }
  });

  it('reports binary content as binary even when it is over the limit', () => {
    const before = Buffer.concat([Buffer.from([0x00]), big(100)]);
    const result = diffContent(before, big(100), { maxBytes: 10 });
    expect(result.binary).toBe(true);
  });

  it('treats a non-positive limit as unlimited', () => {
    const result = diffContent(big(100), big(100, 'b'), { maxBytes: 0 });
    expect(result.tooLarge).toBe(false);
  });

  it('applies the default limit when no option is given', () => {
    const oversize = Buffer.alloc(DEFAULT_MAX_DIFF_BYTES + 1, 0x61);
    const result = diffContent(oversize, oversize);
    expect(result.tooLarge).toBe(true);
  });
});
