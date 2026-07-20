import { describe, it, expect } from 'vitest';
import { sha256Fingerprint } from './fingerprint';

describe('sha256Fingerprint', () => {
  it('produces an OpenSSH-style SHA256 fingerprint for a known key blob', () => {
    // 期待値は openssl で独立計算: printf 'SFTPS-test-key' | openssl dgst -sha256 -binary | openssl base64
    expect(sha256Fingerprint(Buffer.from('SFTPS-test-key', 'utf8'))).toBe(
      'SHA256:/3XkE9Z5/PYoSkRjrRVV9ZFaN8sZFmRvqxrWNs2gr2Q',
    );
  });

  it('strips base64 padding and prefixes with SHA256:', () => {
    const fp = sha256Fingerprint(Buffer.from('SFTPS-test-key', 'utf8'));
    expect(fp.startsWith('SHA256:')).toBe(true);
    expect(fp.endsWith('=')).toBe(false);
  });
});
