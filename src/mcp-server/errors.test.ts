import { describe, it, expect } from 'vitest';
import { HostKeyTrustRequiredError } from './errors';

describe('HostKeyTrustRequiredError', () => {
  it('carries the fingerprint fields needed to call trust_host_key', () => {
    const err = new HostKeyTrustRequiredError('example.com', 22, 'SHA256:new', 'unknown', null);
    expect(err.host).toBe('example.com');
    expect(err.port).toBe(22);
    expect(err.fingerprint).toBe('SHA256:new');
    expect(err.verdict).toBe('unknown');
    expect(err.knownFingerprint).toBeNull();
    expect(err.message).toContain('trust_host_key');
    expect(err.message).toContain('SHA256:new');
  });

  it('instructs remove_host_key before trust_host_key on a mismatch', () => {
    const err = new HostKeyTrustRequiredError(
      'example.com',
      22,
      'SHA256:new',
      'mismatch',
      'SHA256:old',
    );
    expect(err.message).toContain('remove_host_key');
    expect(err.message).toContain('SHA256:old');
    expect(err.message).toContain('SHA256:new');
  });
});
