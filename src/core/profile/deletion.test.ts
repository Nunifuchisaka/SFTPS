import { describe, it, expect } from 'vitest';
import { planProfileDeletion } from './deletion';
import type { Profile } from './index';

const sftp = (id: string, host: string, port = 22): Profile => ({
  id,
  name: id,
  protocol: 'sftp',
  host,
  port,
  user: 'u',
});

const ftp = (id: string, host: string): Profile => ({
  id,
  name: id,
  protocol: 'ftp',
  host,
  port: 21,
  user: 'u',
});

const s3 = (id: string): Profile => ({
  id,
  name: id,
  protocol: 's3',
  region: 'ap-northeast-1',
  bucket: 'my-bucket',
});

describe('planProfileDeletion', () => {
  it('always removes the profile itself and its secrets', () => {
    const plan = planProfileDeletion('p1', { profiles: [sftp('p1', 'a.example')] });
    expect(plan.profileId).toBe('p1');
    expect(plan.removeSecrets).toBe(true);
    expect(plan.removeBookmarks).toBe(false);
    expect(plan.removeHistory).toBe(false);
    expect(plan.removeKnownHosts).toEqual([]);
    expect(plan.backupNamespaces).toEqual([]);
  });

  it('adds bookmarks / history / known hosts when related data removal is requested', () => {
    const plan = planProfileDeletion('p1', {
      profiles: [sftp('p1', 'a.example'), sftp('p2', 'b.example')],
      knownHosts: [
        { host: 'a.example', port: 22, fingerprint: 'SHA256:aaa' },
        { host: 'b.example', port: 22, fingerprint: 'SHA256:bbb' },
      ],
      removeRelatedData: true,
    });
    expect(plan.removeBookmarks).toBe(true);
    expect(plan.removeHistory).toBe(true);
    expect(plan.removeKnownHosts).toEqual([{ host: 'a.example', port: 22 }]);
  });

  it('keeps a host key that another remaining profile still uses', () => {
    const plan = planProfileDeletion('p1', {
      profiles: [sftp('p1', 'shared.example'), sftp('p2', 'shared.example')],
      knownHosts: [{ host: 'shared.example', port: 22, fingerprint: 'SHA256:aaa' }],
      removeRelatedData: true,
    });
    expect(plan.removeKnownHosts).toEqual([]);
  });

  it('matches host keys by port as well', () => {
    const plan = planProfileDeletion('p1', {
      profiles: [sftp('p1', 'h.example', 2222), sftp('p2', 'h.example', 22)],
      knownHosts: [
        { host: 'h.example', port: 22, fingerprint: 'SHA256:aaa' },
        { host: 'h.example', port: 2222, fingerprint: 'SHA256:bbb' },
      ],
      removeRelatedData: true,
    });
    expect(plan.removeKnownHosts).toEqual([{ host: 'h.example', port: 2222 }]);
  });

  it('never touches host keys for non-sftp profiles (they have none)', () => {
    const plan = planProfileDeletion('p1', {
      profiles: [ftp('p1', 'a.example'), s3('p2')],
      knownHosts: [{ host: 'a.example', port: 21, fingerprint: 'SHA256:aaa' }],
      removeRelatedData: true,
    });
    expect(plan.removeKnownHosts).toEqual([]);
  });

  it('lists both backup namespaces (upload and download) only when backups are requested', () => {
    const base = { profiles: [sftp('p1', 'a.example')] };
    expect(planProfileDeletion('p1', { ...base, removeBackups: true }).backupNamespaces).toEqual([
      'p1',
      'p1/download',
    ]);
    expect(planProfileDeletion('p1', base).backupNamespaces).toEqual([]);
  });

  it('rejects an unsafe profile id so the plan can never point outside the data dirs', () => {
    expect(() => planProfileDeletion('../../etc', { profiles: [] })).toThrow(/invalid profile id/);
    expect(() => planProfileDeletion('', { profiles: [] })).toThrow(/invalid profile id/);
  });

  it('works when the profile is already gone (idempotent cleanup)', () => {
    const plan = planProfileDeletion('ghost', {
      profiles: [sftp('p2', 'b.example')],
      knownHosts: [{ host: 'b.example', port: 22, fingerprint: 'SHA256:bbb' }],
      removeRelatedData: true,
      removeBackups: true,
    });
    expect(plan.removeKnownHosts).toEqual([]);
    expect(plan.backupNamespaces).toEqual(['ghost', 'ghost/download']);
  });
});
