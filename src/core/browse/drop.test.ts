import { describe, it, expect } from 'vitest';
import { resolveDropTargets } from './drop';

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
