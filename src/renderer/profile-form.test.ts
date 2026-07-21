import { describe, it, expect } from 'vitest';
import { stripSecrets, type FtpProfile, type SftpProfile, type S3Profile } from '../core/profile/index';
import { profileToFormValues, buildProfileFromForm, emptyFormValues } from './profile-form';

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
