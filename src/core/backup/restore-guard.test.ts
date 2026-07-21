import { describe, it, expect } from 'vitest';
import { confirmRestore } from './restore-guard';

const info = { timestamp: new Date('2026-07-20T01:02:03.004Z'), path: '/b/2026.txt', size: 1234 };

describe('confirmRestore', () => {
  it('always requires confirmation before overwriting the current remote file', () => {
    const r = confirmRestore('/pub/index.html', info);
    expect(r.requiresConfirm).toBe(true);
  });

  it('shows the target path, the generation timestamp and the size', () => {
    const r = confirmRestore('/pub/index.html', info);
    expect(r.message).toContain('/pub/index.html');
    expect(r.message).toContain(info.timestamp.toLocaleString());
    expect(r.message).toContain('1234');
  });

  it('states that the current remote content is backed up first', () => {
    expect(confirmRestore('/pub/index.html', info).message).toContain('バックアップ');
  });
});
