import { describe, it, expect } from 'vitest';
import {
  toggleSelection,
  selectAll,
  clearSelection,
  selectRange,
  pruneSelection,
} from './selection';

describe('selection state (pure)', () => {
  it('toggles a path on and off', () => {
    const s1 = toggleSelection(new Set<string>(), '/a');
    expect([...s1]).toEqual(['/a']);
    const s2 = toggleSelection(s1, '/a');
    expect([...s2]).toEqual([]);
  });

  it('selectAll takes every path; clearSelection empties', () => {
    expect([...selectAll(['/a', '/b'])].sort()).toEqual(['/a', '/b']);
    expect([...clearSelection()]).toEqual([]);
  });

  it('selectRange covers the contiguous range regardless of direction', () => {
    const ordered = ['/a', '/b', '/c', '/d'];
    expect([...selectRange(ordered, '/b', '/d')].sort()).toEqual(['/b', '/c', '/d']);
    expect([...selectRange(ordered, '/d', '/b')].sort()).toEqual(['/b', '/c', '/d']);
  });

  it('selectRange returns empty when an endpoint is missing', () => {
    expect([...selectRange(['/a', '/b'], '/a', '/x')]).toEqual([]);
  });

  it('pruneSelection drops paths that no longer exist (e.g. after filtering)', () => {
    const sel = new Set(['/a', '/b', '/stale']);
    expect([...pruneSelection(sel, ['/a', '/b', '/c'])].sort()).toEqual(['/a', '/b']);
  });

  it('does not mutate the input set', () => {
    const original = new Set(['/a']);
    toggleSelection(original, '/b');
    expect([...original]).toEqual(['/a']);
  });
});
