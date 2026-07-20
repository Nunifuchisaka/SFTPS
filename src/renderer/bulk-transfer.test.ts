import { describe, it, expect } from 'vitest';
import type { DropTarget } from '../core/browse/index';
import { buildUploadRequests, buildRequestsFromDropTargets } from './bulk-transfer';

describe('buildUploadRequests', () => {
  it('turns N selected local paths into N upload requests under the dest dir', () => {
    const reqs = buildUploadRequests('p1', ['/a/x.txt', '/a/y.txt'], '/pub');
    expect(reqs).toHaveLength(2);
    expect(reqs).toEqual([
      { kind: 'upload', profileId: 'p1', localPath: '/a/x.txt', remotePath: '/pub/x.txt', label: 'x.txt' },
      { kind: 'upload', profileId: 'p1', localPath: '/a/y.txt', remotePath: '/pub/y.txt', label: 'y.txt' },
    ]);
  });
});

describe('buildRequestsFromDropTargets', () => {
  it('maps upload targets to upload requests and sync targets to sync requests', () => {
    const targets: DropTarget[] = [
      { kind: 'upload', sourcePath: '/a/f.txt', destPath: '/pub/f.txt' },
      { kind: 'sync', sourcePath: '/a/dir', destPath: '/pub/dir' },
    ];
    const reqs = buildRequestsFromDropTargets('p1', targets);
    expect(reqs[0]).toEqual({
      kind: 'upload',
      profileId: 'p1',
      localPath: '/a/f.txt',
      remotePath: '/pub/f.txt',
      label: 'f.txt',
    });
    expect(reqs[1]).toEqual({
      kind: 'sync',
      profileId: 'p1',
      localDir: '/a/dir',
      remoteDir: '/pub/dir',
      label: 'sync → /pub/dir',
    });
  });
});
