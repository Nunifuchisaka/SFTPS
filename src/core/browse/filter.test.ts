import { describe, it, expect } from 'vitest';
import type { RemoteEntry } from '../transport/index';
import { filterEntries } from './filter';

function e(name: string, type: 'file' | 'dir'): RemoteEntry {
  return { name, path: `/${name}`, type, size: 0, modifiedAt: null };
}

const entries: RemoteEntry[] = [
  e('index.HTML', 'file'),
  e('docs', 'dir'),
  e('style.css', 'file'),
  e('.hidden', 'file'),
  e('DIST', 'dir'),
];

describe('filterEntries', () => {
  it('matches by case-insensitive substring', () => {
    expect(filterEntries(entries, 'DOCS').map((x) => x.name)).toEqual(['docs']);
    expect(filterEntries(entries, 'oc').map((x) => x.name)).toEqual(['docs']);
  });

  it('hides dotfiles unless showHidden is set', () => {
    expect(filterEntries(entries, '', { showHidden: false }).some((x) => x.name === '.hidden')).toBe(false);
    expect(filterEntries(entries, '', { showHidden: true }).some((x) => x.name === '.hidden')).toBe(true);
  });

  it('always keeps directories before files', () => {
    const result = filterEntries(entries, '', { showHidden: true });
    const firstFileIndex = result.findIndex((x) => x.type === 'file');
    const lastDirIndex = result.map((x) => x.type).lastIndexOf('dir');
    expect(lastDirIndex).toBeLessThan(firstFileIndex);
  });
});
