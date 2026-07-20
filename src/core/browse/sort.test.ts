import { describe, it, expect } from 'vitest';
import type { RemoteEntry } from '../transport/index';
import { sortEntries } from './sort';

function f(name: string, size: number, ms: number): RemoteEntry {
  return { name, path: `/${name}`, type: 'file', size, modifiedAt: new Date(ms) };
}
function d(name: string): RemoteEntry {
  return { name, path: `/${name}`, type: 'dir', size: 0, modifiedAt: null };
}

const entries: RemoteEntry[] = [
  f('b.txt', 30, 2000),
  d('zeta'),
  f('a.txt', 10, 3000),
  d('alpha'),
  f('c.txt', 20, 1000),
];

describe('sortEntries', () => {
  it('keeps directories first regardless of key', () => {
    const result = sortEntries(entries, 'size', 'asc');
    expect(result.slice(0, 2).every((x) => x.type === 'dir')).toBe(true);
    expect(result.slice(2).every((x) => x.type === 'file')).toBe(true);
  });

  it('sorts by name ascending and descending', () => {
    expect(sortEntries(entries, 'name', 'asc').filter((x) => x.type === 'file').map((x) => x.name)).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
    ]);
    expect(sortEntries(entries, 'name', 'desc').filter((x) => x.type === 'file').map((x) => x.name)).toEqual([
      'c.txt',
      'b.txt',
      'a.txt',
    ]);
  });

  it('sorts by size', () => {
    expect(sortEntries(entries, 'size', 'asc').filter((x) => x.type === 'file').map((x) => x.size)).toEqual([
      10, 20, 30,
    ]);
  });

  it('sorts by modified time', () => {
    expect(
      sortEntries(entries, 'modified', 'asc')
        .filter((x) => x.type === 'file')
        .map((x) => x.name),
    ).toEqual(['c.txt', 'b.txt', 'a.txt']);
  });

  it('also sorts the directory group', () => {
    expect(sortEntries(entries, 'name', 'asc').filter((x) => x.type === 'dir').map((x) => x.name)).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});
