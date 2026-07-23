import { describe, it, expect } from 'vitest';
import type { SftpProfile } from '../core/profile/index';
import type { HostKeyPromptRequest } from '../core/hostkey/index';
import {
  createHostKeyRejectionTracker,
  enrichConnectionResult,
  withHostKeyErrorEnrichment,
} from './host-key-bridge';
import { HostKeyTrustRequiredError } from './errors';

const sftpProfile: SftpProfile = {
  id: 's1',
  name: 'SFTP',
  protocol: 'sftp',
  host: 'sftp.example.com',
  port: 22,
  user: 'bob',
};

function fakeService(profiles: SftpProfile[] = [sftpProfile]) {
  return { listProfiles: async () => profiles };
}

const rejection: HostKeyPromptRequest = {
  host: 'sftp.example.com',
  port: 22,
  fingerprint: 'SHA256:new',
  verdict: 'unknown',
  knownFingerprint: null,
};

describe('HostKeyRejectionTracker', () => {
  it('take() returns and consumes a recorded rejection (one-shot)', () => {
    const tracker = createHostKeyRejectionTracker();
    tracker.record(rejection);
    expect(tracker.take('sftp.example.com', 22)).toEqual(rejection);
    expect(tracker.take('sftp.example.com', 22)).toBeNull();
  });

  it('take() returns null when nothing was recorded for that host:port', () => {
    const tracker = createHostKeyRejectionTracker();
    expect(tracker.take('nowhere.example.com', 22)).toBeNull();
  });

  it('keeps separate entries per host:port', () => {
    const tracker = createHostKeyRejectionTracker();
    tracker.record(rejection);
    tracker.record({ ...rejection, host: 'other.example.com', fingerprint: 'SHA256:other' });
    expect(tracker.take('other.example.com', 22)?.fingerprint).toBe('SHA256:other');
    expect(tracker.take('sftp.example.com', 22)?.fingerprint).toBe('SHA256:new');
  });
});

describe('withHostKeyErrorEnrichment', () => {
  it('rethrows the original error unchanged when it is not a hostkey error', async () => {
    const tracker = createHostKeyRejectionTracker();
    const original = new Error('ETIMEDOUT');
    await expect(
      withHostKeyErrorEnrichment(fakeService(), 's1', tracker, () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });

  it('rethrows the original error when classified as hostkey but nothing was recorded', async () => {
    const tracker = createHostKeyRejectionTracker();
    const original = new Error('Host denied (verification failed)');
    await expect(
      withHostKeyErrorEnrichment(fakeService(), 's1', tracker, () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });

  it('replaces a hostkey-classified error with HostKeyTrustRequiredError using the tracked fingerprint', async () => {
    const tracker = createHostKeyRejectionTracker();
    tracker.record(rejection);

    await expect(
      withHostKeyErrorEnrichment(fakeService(), 's1', tracker, () => {
        throw new Error('Host denied (verification failed)');
      }),
    ).rejects.toBeInstanceOf(HostKeyTrustRequiredError);
  });

  it('does not enrich when the profile cannot be found (no host:port to look up)', async () => {
    const tracker = createHostKeyRejectionTracker();
    tracker.record(rejection);
    const original = new Error('Host denied (verification failed)');

    await expect(
      withHostKeyErrorEnrichment(fakeService([]), 's1', tracker, () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });

  it('returns the successful result unchanged', async () => {
    const tracker = createHostKeyRejectionTracker();
    await expect(
      withHostKeyErrorEnrichment(fakeService(), 's1', tracker, async () => 'ok'),
    ).resolves.toBe('ok');
  });
});

describe('enrichConnectionResult', () => {
  it('passes through a successful result', async () => {
    const tracker = createHostKeyRejectionTracker();
    const result = await enrichConnectionResult(fakeService(), 's1', tracker, { ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('passes through a non-hostkey failure unchanged', async () => {
    const tracker = createHostKeyRejectionTracker();
    const result = await enrichConnectionResult(fakeService(), 's1', tracker, {
      ok: false,
      error: 'ECONNREFUSED',
    });
    expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });

  it('enriches a hostkey failure using the tracked fingerprint', async () => {
    const tracker = createHostKeyRejectionTracker();
    tracker.record(rejection);

    const result = await enrichConnectionResult(fakeService(), 's1', tracker, {
      ok: false,
      error: 'Host denied (verification failed)',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('trust_host_key');
    expect(result.error).toContain('SHA256:new');
  });

  it('falls back to the original error when nothing was recorded', async () => {
    const tracker = createHostKeyRejectionTracker();
    const result = await enrichConnectionResult(fakeService(), 's1', tracker, {
      ok: false,
      error: 'Host denied (verification failed)',
    });
    expect(result).toEqual({ ok: false, error: 'Host denied (verification failed)' });
  });
});
