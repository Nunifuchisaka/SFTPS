import { describe, it, expect } from 'vitest';
import { SECRET_KEYS } from '../../core/profile/index';
import { profileSchema, secretKeySchema } from './profile';

describe('profileSchema', () => {
  it('parses a valid ftp profile', () => {
    const result = profileSchema.parse({
      id: 'p1',
      name: 'My FTP',
      protocol: 'ftp',
      host: 'ftp.example.com',
      port: 21,
      user: 'alice',
      password: 'hunter2',
    });
    expect(result).toMatchObject({ protocol: 'ftp', host: 'ftp.example.com', port: 21 });
  });

  it('parses a valid sftp profile with only some secret fields set', () => {
    const result = profileSchema.parse({
      id: 's1',
      name: 'My SFTP',
      protocol: 'sftp',
      host: 'sftp.example.com',
      port: 22,
      user: 'bob',
      hostKeyPolicy: 'strict',
    });
    expect(result).toMatchObject({ protocol: 'sftp', hostKeyPolicy: 'strict' });
  });

  it('parses a valid s3 profile', () => {
    const result = profileSchema.parse({
      id: 'x1',
      name: 'My Bucket',
      protocol: 's3',
      region: 'ap-northeast-1',
      bucket: 'my-bucket',
    });
    expect(result).toMatchObject({ protocol: 's3', bucket: 'my-bucket' });
  });

  it('rejects an unknown protocol', () => {
    expect(() =>
      profileSchema.parse({ id: 'p1', name: 'x', protocol: 'webdav', host: 'h', port: 1, user: 'u' }),
    ).toThrow();
  });

  it('rejects a profile missing a required field for its protocol', () => {
    expect(() => profileSchema.parse({ id: 'p1', name: 'x', protocol: 'ftp', port: 21, user: 'u' })).toThrow();
  });

  it('strips unknown fields rather than rejecting the whole profile', () => {
    const result = profileSchema.parse({
      id: 'p1',
      name: 'x',
      protocol: 'ftp',
      host: 'h',
      port: 21,
      user: 'u',
      unexpectedField: 'should be dropped',
    });
    expect(result).not.toHaveProperty('unexpectedField');
  });

  it('rejects values outside the IPC/MCP safety bounds', () => {
    expect(() =>
      profileSchema.parse({
        id: 'p1',
        name: 'x',
        protocol: 'ftp',
        host: 'h',
        port: 999999,
        user: 'u',
      }),
    ).toThrow();
  });
});

describe('secretKeySchema', () => {
  it('matches core/profile SECRET_KEYS exactly', () => {
    for (const key of SECRET_KEYS) {
      expect(secretKeySchema.parse(key)).toBe(key);
    }
    expect(() => secretKeySchema.parse('notASecretKey')).toThrow();
  });
});
