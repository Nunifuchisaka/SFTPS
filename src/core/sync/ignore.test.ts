import { describe, it, expect } from 'vitest';
import { isIgnored, DEFAULT_IGNORE } from './ignore';

describe('isIgnored (default patterns)', () => {
  it('ignores .git and node_modules anywhere in the path', () => {
    expect(isIgnored('.git/config', DEFAULT_IGNORE)).toBe(true);
    expect(isIgnored('src/node_modules/pkg/index.js', DEFAULT_IGNORE)).toBe(true);
  });

  it('does not ignore ordinary source files', () => {
    expect(isIgnored('src/app.ts', DEFAULT_IGNORE)).toBe(false);
    expect(isIgnored('index.html', DEFAULT_IGNORE)).toBe(false);
  });
});

describe('isIgnored (custom patterns)', () => {
  it('matches a *.ext glob against the basename', () => {
    expect(isIgnored('logs/error.log', ['*.log'])).toBe(true);
    expect(isIgnored('src/app.tsx', ['*.log'])).toBe(false);
  });

  it('matches a directory glob with ** against the full relative path', () => {
    expect(isIgnored('dist/a/b.js', ['dist/**'])).toBe(true);
    expect(isIgnored('src/a.js', ['dist/**'])).toBe(false);
  });

  it('matches a bare name against any path segment', () => {
    expect(isIgnored('a/tmp/b.txt', ['tmp'])).toBe(true);
    expect(isIgnored('a/b/c.txt', ['tmp'])).toBe(false);
  });
});
