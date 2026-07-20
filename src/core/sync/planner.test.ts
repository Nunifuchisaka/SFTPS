import { describe, it, expect } from 'vitest';
import { planSync, summarizePlan } from './planner';
import type { SyncEntry } from './types';

function f(path: string, size: number, ms?: number): SyncEntry {
  return { path, type: 'file', size, modifiedAt: ms === undefined ? null : new Date(ms) };
}
function d(path: string): SyncEntry {
  return { path, type: 'dir', size: 0, modifiedAt: null };
}

describe('planSync (default: size-and-mtime, no delete)', () => {
  it('uploads a brand-new file', () => {
    expect(planSync([f('a.txt', 3, 1000)], [])).toEqual([
      { type: 'upload', path: 'a.txt', reason: 'new' },
    ]);
  });

  it('skips a file with identical size and mtime', () => {
    expect(planSync([f('a.txt', 3, 1000)], [f('a.txt', 3, 1000)])).toEqual([
      { type: 'skip', path: 'a.txt', reason: 'unchanged' },
    ]);
  });

  it('uploads when the size differs', () => {
    expect(planSync([f('a.txt', 5, 1000)], [f('a.txt', 3, 1000)])).toEqual([
      { type: 'upload', path: 'a.txt', reason: 'size changed' },
    ]);
  });

  it('uploads when the source is newer (same size)', () => {
    expect(planSync([f('a.txt', 3, 2000)], [f('a.txt', 3, 1000)])).toEqual([
      { type: 'upload', path: 'a.txt', reason: 'newer' },
    ]);
  });

  it('creates a directory missing on the dest, and skips an existing one', () => {
    expect(planSync([d('sub')], [])).toEqual([{ type: 'create-dir', path: 'sub', reason: 'missing dir' }]);
    expect(planSync([d('sub')], [d('sub')])).toEqual([{ type: 'skip', path: 'sub', reason: 'dir exists' }]);
  });
});

describe('planSync compareBy', () => {
  it('compareBy "size" ignores a newer mtime', () => {
    expect(planSync([f('a.txt', 3, 2000)], [f('a.txt', 3, 1000)], { compareBy: 'size' })).toEqual([
      { type: 'skip', path: 'a.txt', reason: 'unchanged' },
    ]);
  });

  it('compareBy "mtime" ignores a size difference', () => {
    expect(planSync([f('a.txt', 9, 1000)], [f('a.txt', 3, 1000)], { compareBy: 'mtime' })).toEqual([
      { type: 'skip', path: 'a.txt', reason: 'unchanged' },
    ]);
    expect(planSync([f('a.txt', 3, 2000)], [f('a.txt', 3, 1000)], { compareBy: 'mtime' })).toEqual([
      { type: 'upload', path: 'a.txt', reason: 'newer' },
    ]);
  });
});

describe('planSync delete-extra', () => {
  const source = [f('a.txt', 3, 1000)];
  const dest = [f('a.txt', 3, 1000), f('old.txt', 1, 500)];

  it('omits extraneous dest files by default', () => {
    const plan = planSync(source, dest);
    expect(plan.some((a) => a.type === 'delete-extra')).toBe(false);
  });

  it('includes delete-extra when deleteExtraneous is enabled', () => {
    const plan = planSync(source, dest, { deleteExtraneous: true });
    expect(plan).toContainEqual({ type: 'delete-extra', path: 'old.txt', reason: 'extraneous' });
  });
});

describe('summarizePlan', () => {
  it('counts actions by type', () => {
    const plan = planSync(
      [f('a.txt', 5, 1000), f('b.txt', 3, 1000), d('sub')],
      [f('b.txt', 3, 1000), f('gone.txt', 1, 1)],
      { deleteExtraneous: true },
    );
    expect(summarizePlan(plan)).toEqual({ upload: 1, createDir: 1, skip: 1, deleteExtra: 1 });
  });
});
