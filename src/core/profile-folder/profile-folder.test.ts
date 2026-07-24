import { describe, it, expect } from 'vitest';
import type { FtpProfile } from '../profile/index';
import {
  isValidFolderId,
  validateProfileFolder,
  sortFolders,
  reorderFolders,
  profilesInGroup,
  moveProfileToFolder,
  removeFolderAssignment,
  resolveDropSide,
  serializeProfileFolders,
  parseProfileFolders,
  type ProfileFolder,
} from './index';

function ftp(id: string, extra: Partial<FtpProfile> = {}): FtpProfile {
  return {
    id,
    name: id,
    protocol: 'ftp',
    host: 'h',
    port: 21,
    user: 'u',
    ...extra,
  };
}

describe('isValidFolderId', () => {
  it('accepts ordinary identifiers', () => {
    expect(isValidFolderId('folder-1')).toBe(true);
  });

  it('rejects traversal, empty and unsafe ids', () => {
    expect(isValidFolderId('..')).toBe(false);
    expect(isValidFolderId('')).toBe(false);
    expect(isValidFolderId('a/b')).toBe(false);
  });
});

describe('validateProfileFolder', () => {
  it('accepts a valid folder', () => {
    expect(validateProfileFolder({ id: 'f1', name: 'Prod', order: 0 })).toEqual([]);
  });

  it('reports a missing name and invalid id', () => {
    const errors = validateProfileFolder({ id: '..', name: '', order: 0 });
    expect(errors.some((e) => /id/.test(e))).toBe(true);
    expect(errors.some((e) => /name/.test(e))).toBe(true);
  });

  it('reports a non-integer order', () => {
    const errors = validateProfileFolder({ id: 'f1', name: 'x', order: 1.5 });
    expect(errors.some((e) => /order/.test(e))).toBe(true);
  });
});

describe('sortFolders', () => {
  it('sorts by order ascending without mutating the input', () => {
    const folders: ProfileFolder[] = [
      { id: 'b', name: 'B', order: 2 },
      { id: 'a', name: 'A', order: 0 },
      { id: 'c', name: 'C', order: 1 },
    ];
    const sorted = sortFolders(folders);
    expect(sorted.map((f) => f.id)).toEqual(['a', 'c', 'b']);
    expect(folders.map((f) => f.id)).toEqual(['b', 'a', 'c']); // 元は不変
  });
});

describe('reorderFolders', () => {
  const folders: ProfileFolder[] = [
    { id: 'a', name: 'A', order: 0 },
    { id: 'b', name: 'B', order: 1 },
    { id: 'c', name: 'C', order: 2 },
  ];

  it('moves a folder to the target index and renumbers order sequentially', () => {
    const next = reorderFolders(folders, 'c', 0);
    expect(next.map((f) => f.id)).toEqual(['c', 'a', 'b']);
    expect(next.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it('clamps an out-of-range target index', () => {
    const next = reorderFolders(folders, 'a', 999);
    expect(next.map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns the original array unchanged for an unknown id', () => {
    expect(reorderFolders(folders, 'missing', 0)).toBe(folders);
  });
});

describe('profilesInGroup', () => {
  it('returns profiles for a folder sorted by order', () => {
    const profiles = [
      ftp('p1', { folderId: 'f1', order: 1 }),
      ftp('p2', { folderId: 'f1', order: 0 }),
      ftp('p3', { folderId: 'f2', order: 0 }),
    ];
    expect(profilesInGroup(profiles, 'f1').map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('treats an undefined folderId as the unfiled (null) group', () => {
    const profiles = [ftp('p1', { order: 0 }), ftp('p2', { folderId: 'f1', order: 0 })];
    expect(profilesInGroup(profiles, null).map((p) => p.id)).toEqual(['p1']);
  });
});

describe('moveProfileToFolder', () => {
  it('reorders within the same (unfiled) group', () => {
    const profiles = [ftp('p1', { order: 0 }), ftp('p2', { order: 1 }), ftp('p3', { order: 2 })];
    const next = moveProfileToFolder(profiles, 'p3', null, 0);
    expect(profilesInGroup(next, null).map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('moves a profile into a folder and renumbers both groups', () => {
    const profiles = [
      ftp('p1', { order: 0 }),
      ftp('p2', { order: 1 }),
      ftp('p3', { folderId: 'f1', order: 0 }),
    ];
    const next = moveProfileToFolder(profiles, 'p1', 'f1', 0);
    const moved = next.find((p) => p.id === 'p1')!;
    expect(moved.folderId).toBe('f1');
    expect(profilesInGroup(next, 'f1').map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(profilesInGroup(next, null).map((p) => p.id)).toEqual(['p2']);
  });

  it('clamps an out-of-range target index', () => {
    const profiles = [ftp('p1', { order: 0 }), ftp('p2', { order: 1 })];
    const next = moveProfileToFolder(profiles, 'p1', null, 999);
    expect(profilesInGroup(next, null).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('returns the original array unchanged for an unknown profile id', () => {
    const profiles = [ftp('p1', { order: 0 })];
    expect(moveProfileToFolder(profiles, 'missing', null, 0)).toBe(profiles);
  });

  it('leaves other groups untouched', () => {
    const profiles = [
      ftp('p1', { folderId: 'f1', order: 0 }),
      ftp('p2', { folderId: 'f2', order: 0 }),
    ];
    const next = moveProfileToFolder(profiles, 'p1', 'f1', 0);
    expect(next.find((p) => p.id === 'p2')).toEqual(profiles[1]);
  });
});

describe('removeFolderAssignment', () => {
  it('unassigns profiles from the folder, appending them after existing unfiled ones', () => {
    const profiles = [
      ftp('p1', { order: 0 }), // already unfiled
      ftp('p2', { folderId: 'f1', order: 0 }),
      ftp('p3', { folderId: 'f1', order: 1 }),
    ];
    const next = removeFolderAssignment(profiles, 'f1');
    expect(next.every((p) => p.folderId === undefined)).toBe(true);
    expect(profilesInGroup(next, null).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('leaves profiles in other folders untouched', () => {
    const profiles = [ftp('p1', { folderId: 'f2', order: 0 })];
    expect(removeFolderAssignment(profiles, 'f1')).toEqual(profiles);
  });
});

describe('resolveDropSide', () => {
  it('resolves to before when the cursor is above the row midpoint', () => {
    expect(resolveDropSide(100, 40, 110)).toBe('before');
  });

  it('resolves to after when the cursor is below the row midpoint', () => {
    expect(resolveDropSide(100, 40, 130)).toBe('after');
  });
});

describe('serializeProfileFolders / parseProfileFolders', () => {
  it('round-trips folders sorted by order', () => {
    const folders: ProfileFolder[] = [
      { id: 'b', name: 'B', order: 1 },
      { id: 'a', name: 'A', order: 0 },
    ];
    const json = serializeProfileFolders(folders);
    const parsed = parseProfileFolders(json);
    expect(parsed.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('rejects JSON with an invalid folder', () => {
    const bad = JSON.stringify([{ id: '..', name: 'x', order: 0 }]);
    expect(() => parseProfileFolders(bad)).toThrow();
  });

  it('rejects a non-array JSON value', () => {
    expect(() => parseProfileFolders('{}')).toThrow();
  });
});
