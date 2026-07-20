import { describe, it, expect } from 'vitest';
import {
  validateProfile,
  stripSecrets,
  assertNoSecrets,
  extractSecrets,
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

  it('rejects invalid S3 bucket names', () => {
    expect(validateProfile({ ...validS3, bucket: 'Ab' }).length).toBeGreaterThan(0); // 大文字・短すぎ
    expect(validateProfile({ ...validS3, bucket: 'has..dots' }).length).toBeGreaterThan(0); // 連続ドット
    expect(validateProfile({ ...validS3, bucket: '192.168.0.1' }).length).toBeGreaterThan(0); // IP形式
    expect(validateProfile({ ...validS3, bucket: 'ok-bucket.1' })).toEqual([]);
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

  it('rejects JSON with an invalid protocol', () => {
    const bad = JSON.stringify([{ id: 'x', name: 'y', protocol: 'gopher', host: 'h', port: 1, user: 'u' }]);
    expect(() => parseProfiles(bad)).toThrow();
  });
});
