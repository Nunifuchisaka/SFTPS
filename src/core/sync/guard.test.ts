import { describe, it, expect } from 'vitest';
import type { SyncAction } from './types';
import { validateSyncDestination, confirmMirrorDeletion } from './guard';

const del = (path: string): SyncAction => ({ type: 'delete-extra', path, reason: 'extraneous' });

describe('validateSyncDestination', () => {
  it('accepts a normal remote directory', () => {
    const r = validateSyncDestination('/var/www/site');
    expect(r.ok).toBe(true);
    expect(r.level).toBe('ok');
  });

  it('rejects an empty destination (it would resolve to the server root)', () => {
    const r = validateSyncDestination('');
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
    expect(r.message).toContain('ルート');
  });

  it('rejects a whitespace-only destination', () => {
    expect(validateSyncDestination('   ').ok).toBe(false);
  });

  it('warns but allows the server root when mirror deletion is off', () => {
    const r = validateSyncDestination('/');
    expect(r.ok).toBe(true);
    expect(r.level).toBe('warn');
    expect(r.message).toContain('/');
  });

  it('rejects the server root when mirror deletion is on', () => {
    const r = validateSyncDestination('/', { deleteExtraneous: true });
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
  });

  it('treats repeated / trailing slashes as the server root', () => {
    expect(validateSyncDestination('///', { deleteExtraneous: true }).ok).toBe(false);
    expect(validateSyncDestination(' / ').level).toBe('warn');
  });

  it('accepts a directory with a trailing slash', () => {
    expect(validateSyncDestination('/site/').ok).toBe(true);
  });
});

describe('confirmMirrorDeletion', () => {
  it('does not require confirmation when the plan deletes nothing', () => {
    const r = confirmMirrorDeletion([{ type: 'upload', path: 'a.txt', reason: 'new' }], '/site');
    expect(r.requiresConfirm).toBe(false);
    expect(r.count).toBe(0);
  });

  it('requires confirmation and reports the deletion count and destination', () => {
    const r = confirmMirrorDeletion([del('a.txt'), del('sub/b.txt')], '/site');
    expect(r.requiresConfirm).toBe(true);
    expect(r.count).toBe(2);
    expect(r.message).toContain('2');
    expect(r.message).toContain('/site');
  });

  it('lists the target paths (up to 10) so the user can see what disappears', () => {
    const plan = Array.from({ length: 12 }, (_, i) => del(`f${i}.txt`));
    const r = confirmMirrorDeletion(plan, '/site');
    expect(r.paths).toHaveLength(10);
    expect(r.paths[0]).toBe('f0.txt');
    expect(r.message).toContain('ほか 2 件');
  });

  it('counts only delete-extra actions', () => {
    const r = confirmMirrorDeletion(
      [del('a.txt'), { type: 'skip', path: 'b.txt', reason: 'unchanged' }],
      '/site',
    );
    expect(r.count).toBe(1);
  });
});
