import { describe, it, expect } from 'vitest';
import { resolveS3Credentials } from './s3-credentials';
import type { S3Profile } from './index';

const base: S3Profile = {
  id: 'a',
  name: 's3',
  protocol: 's3',
  region: 'ap-northeast-1',
  bucket: 'my-bucket',
};

describe('resolveS3Credentials', () => {
  it('uses the profile key and the stored secret when both are present', () => {
    const r = resolveS3Credentials({ ...base, accessKeyId: 'AKIA' }, { secretAccessKey: 'sk' });
    expect(r).toEqual({ mode: 'explicit', credentials: { accessKeyId: 'AKIA', secretAccessKey: 'sk' } });
  });

  it('carries a session token when one is stored', () => {
    const r = resolveS3Credentials(
      { ...base, accessKeyId: 'AKIA' },
      { secretAccessKey: 'sk', sessionToken: 'tok' },
    );
    expect(r).toEqual({
      mode: 'explicit',
      credentials: { accessKeyId: 'AKIA', secretAccessKey: 'sk', sessionToken: 'tok' },
    });
  });

  it('refuses to fall back to the machine credential chain by default', () => {
    const r = resolveS3Credentials(base, {});
    expect(r.mode).toBe('missing');
    if (r.mode === 'missing') expect(r.reason).toMatch(/credential/i);
  });

  it('refuses when only one half of the credentials is present', () => {
    expect(resolveS3Credentials({ ...base, accessKeyId: 'AKIA' }, {}).mode).toBe('missing');
    expect(resolveS3Credentials(base, { secretAccessKey: 'sk' }).mode).toBe('missing');
  });

  it('uses the machine default chain only when explicitly opted in', () => {
    const r = resolveS3Credentials({ ...base, useDefaultCredentials: true }, {});
    expect(r).toEqual({ mode: 'default' });
  });

  it('prefers the explicitly configured credentials over the opt-in default chain', () => {
    const r = resolveS3Credentials(
      { ...base, accessKeyId: 'AKIA', useDefaultCredentials: true },
      { secretAccessKey: 'sk' },
    );
    expect(r.mode).toBe('explicit');
  });

  it('treats blank strings as unset', () => {
    expect(resolveS3Credentials({ ...base, accessKeyId: '  ' }, { secretAccessKey: 'sk' }).mode).toBe(
      'missing',
    );
    expect(resolveS3Credentials({ ...base, accessKeyId: 'AKIA' }, { secretAccessKey: '' }).mode).toBe(
      'missing',
    );
  });
});
