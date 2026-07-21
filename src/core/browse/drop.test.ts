import { describe, it, expect } from 'vitest';
import { classifyDroppedPaths, resolveDropTargets } from './drop';

describe('resolveDropTargets', () => {
  it('maps dropped files to upload targets under the destination dir', () => {
    const targets = resolveDropTargets(
      [{ path: '/home/u/a.txt', isDirectory: false }],
      '/pub',
    );
    expect(targets).toEqual([{ kind: 'upload', sourcePath: '/home/u/a.txt', destPath: '/pub/a.txt' }]);
  });

  it('maps dropped directories to sync targets', () => {
    const targets = resolveDropTargets([{ path: '/home/u/site', isDirectory: true }], '/pub');
    expect(targets).toEqual([{ kind: 'sync', sourcePath: '/home/u/site', destPath: '/pub/site' }]);
  });

  it('handles the root destination and Windows-style source paths', () => {
    const targets = resolveDropTargets(
      [
        { path: 'C:\\Users\\me\\report.pdf', isDirectory: false },
        { path: '/x/y/', isDirectory: true },
      ],
      '/',
    );
    expect(targets[0].destPath).toBe('/report.pdf');
    expect(targets[1].destPath).toBe('/y');
    expect(targets[1].kind).toBe('sync');
  });
});

describe('classifyDroppedPaths', () => {
  it('classifies each path as file or directory using the given predicate', async () => {
    const items = await classifyDroppedPaths(
      ['/home/u/a.txt', '/home/u/site'],
      async (p) => p === '/home/u/site',
    );
    expect(items).toEqual([
      { path: '/home/u/a.txt', isDirectory: false },
      { path: '/home/u/site', isDirectory: true },
    ]);
  });

  it('falls back to file (upload) when the predicate rejects', async () => {
    const items = await classifyDroppedPaths(['/gone', '/dir'], async (p) => {
      if (p === '/gone') throw new Error('stat failed');
      return true;
    });
    expect(items).toEqual([
      { path: '/gone', isDirectory: false },
      { path: '/dir', isDirectory: true },
    ]);
  });

  it('returns an empty array for no paths', async () => {
    const items = await classifyDroppedPaths([], async () => true);
    expect(items).toEqual([]);
  });
});
