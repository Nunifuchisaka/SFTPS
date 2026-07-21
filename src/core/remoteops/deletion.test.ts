import { describe, it, expect } from 'vitest';
import type { RemoteEntry } from '../transport/index';
import { confirmDeletion } from './deletion';

function f(name: string): RemoteEntry {
  return { name, path: `/${name}`, type: 'file', size: 0, modifiedAt: null };
}
function d(name: string): RemoteEntry {
  return { name, path: `/${name}`, type: 'dir', size: 0, modifiedAt: null };
}

describe('confirmDeletion', () => {
  it('requires confirmation for a single file and names it', () => {
    const r = confirmDeletion([f('a.txt')]);
    expect(r.requiresConfirm).toBe(true);
    expect(r.count).toBe(1);
    expect(r.message).toContain('a.txt');
  });

  it('warns more strongly for multiple items', () => {
    const r = confirmDeletion([f('a.txt'), f('b.txt'), f('c.txt')]);
    expect(r.requiresConfirm).toBe(true);
    expect(r.count).toBe(3);
    expect(r.message).toContain('3');
  });

  it('warns about recursive directory deletion', () => {
    const r = confirmDeletion([d('folder')]);
    expect(r.requiresConfirm).toBe(true);
    expect(r.message).toMatch(/ディレクトリ|フォルダ|再帰/);
  });

  it('does not require confirmation for an empty selection', () => {
    const r = confirmDeletion([]);
    expect(r.requiresConfirm).toBe(false);
    expect(r.count).toBe(0);
  });
});
