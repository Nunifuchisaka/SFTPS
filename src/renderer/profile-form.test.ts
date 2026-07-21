import { describe, it, expect } from 'vitest';
import { stripSecrets, type FtpProfile, type SftpProfile, type S3Profile } from '../core/profile/index';
import {
  profileToFormValues,
  buildProfileFromForm,
  buildClearSecretsFromForm,
  emptyFormValues,
} from './profile-form';

const ftp: FtpProfile = {
  id: 'f1', name: 'FTP', protocol: 'ftp', host: 'h', port: 21, user: 'u',
  ftpSecurity: 'implicit', password: 'pw',
};
const sftp: SftpProfile = {
  id: 's1', name: 'SFTP', protocol: 'sftp', host: 'h', port: 22, user: 'u',
  hostKeyPolicy: 'strict', privateKey: 'KEY',
};
const s3: S3Profile = {
  id: 'a1', name: 'S3', protocol: 's3', region: 'ap-northeast-1', bucket: 'my-bucket',
  accessKeyId: 'AKIA', secretAccessKey: 'sk',
};

describe('profileToFormValues', () => {
  it('maps an ftp profile and never loads the secret', () => {
    const fv = profileToFormValues(ftp);
    expect(fv.protocol).toBe('ftp');
    expect(fv.host).toBe('h');
    expect(fv.ftpSecurity).toBe('implicit');
    expect(fv.password).toBe('');
  });

  it('maps an sftp profile including hostKeyPolicy, secrets blank', () => {
    const fv = profileToFormValues(sftp);
    expect(fv.hostKeyPolicy).toBe('strict');
    expect(fv.privateKey).toBe('');
    expect(fv.passphrase).toBe('');
  });

  it('maps an s3 profile keeping accessKeyId, secret blank', () => {
    const fv = profileToFormValues(s3);
    expect(fv.region).toBe('ap-northeast-1');
    expect(fv.bucket).toBe('my-bucket');
    expect(fv.accessKeyId).toBe('AKIA');
    expect(fv.secretAccessKey).toBe('');
  });
});

describe('round-trip: profile -> form -> profile (non-secret fields preserved)', () => {
  it('ftp', () => {
    expect(buildProfileFromForm(profileToFormValues(ftp))).toEqual(stripSecrets(ftp));
  });
  it('sftp', () => {
    expect(buildProfileFromForm(profileToFormValues(sftp))).toEqual(stripSecrets(sftp));
  });
  it('s3', () => {
    expect(buildProfileFromForm(profileToFormValues(s3))).toEqual(stripSecrets(s3));
  });

  it('preserves connectTimeoutMs and autoReconnect', () => {
    const p: FtpProfile = { ...ftp, connectTimeoutMs: 15000, autoReconnect: true };
    expect(buildProfileFromForm(profileToFormValues(p))).toEqual(stripSecrets(p));
  });
});

describe('buildProfileFromForm secret handling', () => {
  it('omits empty secret fields (blank = keep existing)', () => {
    const fv = { ...emptyFormValues(), protocol: 'ftp' as const, id: 'x', name: 'x', host: 'h', port: 21, user: 'u', password: '' };
    expect(buildProfileFromForm(fv)).not.toHaveProperty('password');
  });

  it('includes a secret when entered (update)', () => {
    const fv = { ...emptyFormValues(), protocol: 'ftp' as const, id: 'x', name: 'x', host: 'h', port: 21, user: 'u', password: 'secret' };
    expect((buildProfileFromForm(fv) as FtpProfile).password).toBe('secret');
  });
});

describe('buildClearSecretsFromForm', () => {
  it('returns nothing when no clear box is checked', () => {
    expect(buildClearSecretsFromForm(emptyFormValues())).toEqual([]);
  });

  it('returns the checked secret keys for an sftp profile', () => {
    const fv = { ...emptyFormValues(), protocol: 'sftp' as const, clearSecrets: ['privateKey' as const, 'passphrase' as const] };
    expect(buildClearSecretsFromForm(fv)).toEqual(['privateKey', 'passphrase']);
  });

  it('drops keys that do not belong to the selected protocol', () => {
    const fv = { ...emptyFormValues(), protocol: 'ftp' as const, clearSecrets: ['password' as const, 'privateKey' as const] };
    expect(buildClearSecretsFromForm(fv)).toEqual(['password']);
  });

  it('keeps only the s3 secret keys for an s3 profile', () => {
    const fv = { ...emptyFormValues(), protocol: 's3' as const, clearSecrets: ['secretAccessKey' as const, 'password' as const] };
    expect(buildClearSecretsFromForm(fv)).toEqual(['secretAccessKey']);
  });
});

describe('S3 default credential chain opt-in', () => {
  it('defaults to off for a new profile (no implicit machine credentials)', () => {
    expect(emptyFormValues().useDefaultCredentials).toBe(false);
  });

  it('loads the opt-in from an existing profile', () => {
    const fv = profileToFormValues({ ...s3, useDefaultCredentials: true });
    expect(fv.useDefaultCredentials).toBe(true);
  });

  it('writes the opt-in back only when it is enabled', () => {
    const on = buildProfileFromForm({
      ...profileToFormValues(s3),
      useDefaultCredentials: true,
    }) as S3Profile;
    expect(on.useDefaultCredentials).toBe(true);

    const off = buildProfileFromForm(profileToFormValues(s3)) as S3Profile;
    expect(off).not.toHaveProperty('useDefaultCredentials');
  });

  it('never leaks the opt-in into non-s3 profiles', () => {
    const p = buildProfileFromForm({ ...profileToFormValues(ftp), useDefaultCredentials: true });
    expect(p).not.toHaveProperty('useDefaultCredentials');
  });
});
