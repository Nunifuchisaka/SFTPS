import { describe, it, expect } from 'vitest';
import { resolveDownloadTargets } from './download-drop';

describe('resolveDownloadTargets', () => {
  it('maps dragged remote files to download targets under the local destination dir', () => {
    const targets = resolveDownloadTargets(
      [{ path: '/pub/a.txt', type: 'file' }],
      '/home/u/downloads',
    );
    expect(targets).toEqual([
      { kind: 'download', sourcePath: '/pub/a.txt', destPath: '/home/u/downloads/a.txt' },
    ]);
  });

  it('maps dragged remote directories to download-sync targets', () => {
    const targets = resolveDownloadTargets(
      [{ path: '/pub/site', type: 'dir' }],
      '/home/u/downloads',
    );
    expect(targets).toEqual([
      { kind: 'download-sync', sourcePath: '/pub/site', destPath: '/home/u/downloads/site' },
    ]);
  });

  it('handles multiple mixed entries and trailing slashes on the destination dir', () => {
    const targets = resolveDownloadTargets(
      [
        { path: '/pub/report.pdf', type: 'file' },
        { path: '/pub/assets/', type: 'dir' },
      ],
      '/home/u/downloads/',
    );
    expect(targets).toEqual([
      { kind: 'download', sourcePath: '/pub/report.pdf', destPath: '/home/u/downloads/report.pdf' },
      { kind: 'download-sync', sourcePath: '/pub/assets/', destPath: '/home/u/downloads/assets' },
    ]);
  });

  it('returns an empty array for no entries', () => {
    expect(resolveDownloadTargets([], '/home/u/downloads')).toEqual([]);
  });
});
