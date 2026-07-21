import { describe, it, expect } from 'vitest';
import {
  validateProfile,
  stripSecrets,
  assertNoSecrets,
  extractSecrets,
  resolveFtpSecurity,
  resolveSecretUpdate,
  mergeSecrets,
  serializeProfiles,
  parseProfiles,
  type FtpProfile,
  type SftpProfile,
  type S3Profile,
} from './index';

const validFtp: FtpProfile = {
  id: 'f1',
  name: 'My FTP',
  protocol: 'ftp',
  host: 'ftp.example.com',
  port: 21,
  user: 'alice',
  password: 'hunter2',
};

const validSftp: SftpProfile = {
  id: 's1',
  name: 'My SFTP',
  protocol: 'sftp',
  host: 'sftp.example.com',
  port: 22,
  user: 'bob',
  privateKey: '-----BEGIN KEY-----',
  passphrase: 'phrase',
};

const validS3: S3Profile = {
  id: 'a1',
  name: 'My S3',
  protocol: 's3',
  region: 'ap-northeast-1',
  bucket: 'my-bucket',
  accessKeyId: 'AKIA...',
  secretAccessKey: 'topsecret',
};

describe('validateProfile', () => {
  it('accepts a valid ftp/sftp/s3 profile', () => {
    expect(validateProfile(validFtp)).toEqual([]);
    expect(validateProfile(validSftp)).toEqual([]);
    expect(validateProfile(validS3)).toEqual([]);
  });

  it('reports a missing host for ftp', () => {
    const errors = validateProfile({ ...validFtp, host: '' });
    expect(errors.some((e) => /host/.test(e))).toBe(true);
  });

  it('reports a port outside 1..65535', () => {
    expect(validateProfile({ ...validFtp, port: 0 }).some((e) => /port/.test(e))).toBe(true);
    expect(validateProfile({ ...validFtp, port: 70000 }).some((e) => /port/.test(e))).toBe(true);
  });

  it('accepts an sftp profile with a valid hostKeyPolicy', () => {
    expect(validateProfile({ ...validSftp, hostKeyPolicy: 'strict' })).toEqual([]);
    expect(validateProfile({ ...validSftp, hostKeyPolicy: 'tofu' })).toEqual([]);
  });

  it('rejects an sftp profile with an unknown hostKeyPolicy', () => {
    const bad = { ...validSftp, hostKeyPolicy: 'bogus' } as unknown as SftpProfile;
    expect(validateProfile(bad).some((e) => /hostKeyPolicy/.test(e))).toBe(true);
  });

  it('accepts a valid ftpSecurity value (implicit FTPS on port 990)', () => {
    expect(validateProfile({ ...validFtp, ftpSecurity: 'implicit', port: 990 })).toEqual([]);
  });

  it('rejects an unknown ftpSecurity value', () => {
    const bad = { ...validFtp, ftpSecurity: 'bogus' } as unknown as FtpProfile;
    expect(validateProfile(bad).some((e) => /ftpSecurity/.test(e))).toBe(true);
  });

  it('accepts a connectTimeoutMs within range', () => {
    expect(validateProfile({ ...validFtp, connectTimeoutMs: 15000 })).toEqual([]);
  });

  it('rejects non-positive, non-integer or too-large connectTimeoutMs', () => {
    const bad = (v: number): boolean =>
      validateProfile({ ...validFtp, connectTimeoutMs: v }).some((e) => /connectTimeoutMs/.test(e));
    expect(bad(0)).toBe(true);
    expect(bad(-5)).toBe(true);
    expect(bad(1.5)).toBe(true);
    expect(bad(999_999_999)).toBe(true);
  });

  it('rejects invalid S3 bucket names', () => {
    expect(validateProfile({ ...validS3, bucket: 'Ab' }).length).toBeGreaterThan(0); // 大文字・短すぎ
    expect(validateProfile({ ...validS3, bucket: 'has..dots' }).length).toBeGreaterThan(0); // 連続ドット
    expect(validateProfile({ ...validS3, bucket: '192.168.0.1' }).length).toBeGreaterThan(0); // IP形式
    expect(validateProfile({ ...validS3, bucket: 'ok-bucket.1' })).toEqual([]);
  });
});

describe('resolveFtpSecurity', () => {
  it('uses an explicit ftpSecurity value when present', () => {
    expect(resolveFtpSecurity({ ...validFtp, ftpSecurity: 'implicit' })).toBe('implicit');
    expect(resolveFtpSecurity({ ...validFtp, ftpSecurity: 'none' })).toBe('none');
  });

  it('falls back to the legacy secure boolean', () => {
    expect(resolveFtpSecurity({ ...validFtp, secure: true })).toBe('explicit');
    expect(resolveFtpSecurity({ ...validFtp, secure: false })).toBe('none');
  });

  it('defaults to explicit FTPS (secure side) when nothing is set', () => {
    expect(resolveFtpSecurity(validFtp)).toBe('explicit');
  });
});

describe('resolveSecretUpdate', () => {
  it('updates when a new secret value is entered', () => {
    expect(resolveSecretUpdate('newpw', true)).toEqual({ action: 'update' });
    expect(resolveSecretUpdate('newpw', false)).toEqual({ action: 'update' });
  });

  it('keeps the existing secret when the field is left blank (never wipes on blank)', () => {
    expect(resolveSecretUpdate('', true)).toEqual({ action: 'keep' });
    expect(resolveSecretUpdate('   ', true)).toEqual({ action: 'keep' });
    expect(resolveSecretUpdate('', false)).toEqual({ action: 'keep' });
  });

  it('clears only on an explicit clear request', () => {
    expect(resolveSecretUpdate('', true, true)).toEqual({ action: 'clear' });
  });
});

describe('mergeSecrets', () => {
  const existing = { password: 'oldpw', privateKey: 'OLDKEY' };

  it('keeps existing secrets that are absent from the incoming set', () => {
    expect(mergeSecrets(existing, { passphrase: 'newphrase' })).toEqual({
      password: 'oldpw',
      privateKey: 'OLDKEY',
      passphrase: 'newphrase',
    });
  });

  it('keeps every existing secret when nothing is entered', () => {
    expect(mergeSecrets(existing, {})).toEqual(existing);
  });

  it('overwrites only the entered secret', () => {
    expect(mergeSecrets(existing, { password: 'newpw' })).toEqual({
      password: 'newpw',
      privateKey: 'OLDKEY',
    });
  });

  it('removes only the explicitly cleared secret', () => {
    expect(mergeSecrets(existing, {}, ['password'])).toEqual({ privateKey: 'OLDKEY' });
  });

  it('lets an explicit clear win over a value left in the field', () => {
    expect(mergeSecrets(existing, { password: 'typed' }, ['password'])).toEqual({
      privateKey: 'OLDKEY',
    });
  });

  it('ignores non-secret keys in the incoming set', () => {
    expect(mergeSecrets({}, { accessKeyId: 'AKIA' } as Record<string, string>)).toEqual({});
  });

  it('returns an empty record when everything is cleared', () => {
    expect(mergeSecrets(existing, {}, ['password', 'privateKey'])).toEqual({});
  });
});

describe('stripSecrets', () => {
  it('removes secret fields but keeps connection info', () => {
    const stripped = stripSecrets(validSftp);
    expect(stripped).not.toHaveProperty('privateKey');
    expect(stripped).not.toHaveProperty('passphrase');
    expect(stripped.host).toBe('sftp.example.com');
    expect(stripped.user).toBe('bob');
  });

  it('keeps the AWS accessKeyId but removes the secretAccessKey', () => {
    const stripped = stripSecrets(validS3);
    expect(stripped).not.toHaveProperty('secretAccessKey');
    expect((stripped as S3Profile).accessKeyId).toBe('AKIA...');
  });
});

describe('assertNoSecrets', () => {
  it('throws when a secret field slips into a to-be-persisted object', () => {
    expect(() => assertNoSecrets({ id: 'x', password: 'leak' })).toThrow();
  });
});

describe('extractSecrets', () => {
  it('collects only the present secret fields (not accessKeyId)', () => {
    expect(extractSecrets(validSftp)).toEqual({
      privateKey: '-----BEGIN KEY-----',
      passphrase: 'phrase',
    });
    expect(extractSecrets(validS3)).toEqual({ secretAccessKey: 'topsecret' });
  });

  it('returns an empty object when no secrets are set', () => {
    expect(extractSecrets(stripSecrets(validFtp))).toEqual({});
  });
});

describe('serializeProfiles / parseProfiles', () => {
  it('never writes secret values into the JSON', () => {
    const json = serializeProfiles([validFtp, validSftp, validS3]);
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('topsecret');
    expect(json).not.toContain('BEGIN KEY');
  });

  it('round-trips profiles (minus secrets) through JSON', () => {
    const json = serializeProfiles([validFtp]);
    const parsed = parseProfiles(json);
    expect(parsed).toEqual([stripSecrets(validFtp)]);
  });

  it('preserves ftpSecurity through serialize/parse without leaking secrets', () => {
    const json = serializeProfiles([{ ...validFtp, ftpSecurity: 'implicit' }]);
    expect(json).not.toContain('hunter2');
    const parsed = parseProfiles(json);
    expect((parsed[0] as FtpProfile).ftpSecurity).toBe('implicit');
  });

  it('rejects JSON with an invalid protocol', () => {
    const bad = JSON.stringify([{ id: 'x', name: 'y', protocol: 'gopher', host: 'h', port: 1, user: 'u' }]);
    expect(() => parseProfiles(bad)).toThrow();
  });
});
