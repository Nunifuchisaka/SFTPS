import { describe, it, expect } from 'vitest';
import { FtpTransport, SftpTransport, S3Transport } from '../core/transport/index';
import type { FtpClientLike, SftpClientLike, S3ClientLike } from '../core/transport/index';
import type { FtpProfile, SftpProfile, S3Profile } from '../core/profile/index';
import type { HostVerifierFn } from '../core/hostkey/index';
import {
  createTransport,
  buildFtpAccessOptions,
  buildSftpConnectConfig,
  buildS3ClientConfig,
  type TransportFactoryDeps,
} from './transport-factory';

const ftpProfile: FtpProfile = {
  id: 'f', name: 'ftp', protocol: 'ftp', host: 'h', port: 21, user: 'u', secure: true,
};
const sftpProfile: SftpProfile = {
  id: 's', name: 'sftp', protocol: 'sftp', host: 'h', port: 22, user: 'u',
};
const s3Profile: S3Profile = {
  id: 'a', name: 's3', protocol: 's3', region: 'ap-northeast-1', bucket: 'my-bucket', accessKeyId: 'AKIA',
};

function makeDeps(): { deps: TransportFactoryDeps; s3Configs: unknown[] } {
  const s3Configs: unknown[] = [];
  const deps: TransportFactoryDeps = {
    createFtpClient: () => ({}) as unknown as FtpClientLike,
    createSftpClient: () => ({}) as unknown as SftpClientLike,
    createS3Client: (config) => {
      s3Configs.push(config);
      return {} as unknown as S3ClientLike;
    },
  };
  return { deps, s3Configs };
}

describe('config builders', () => {
  it('buildFtpAccessOptions maps the password from secrets', () => {
    const opts = buildFtpAccessOptions(ftpProfile, { password: 'pw' });
    expect(opts).toEqual({ host: 'h', port: 21, user: 'u', password: 'pw', secure: true });
  });

  it('buildFtpAccessOptions maps ftpSecurity to basic-ftp secure values', () => {
    expect(buildFtpAccessOptions({ ...ftpProfile, ftpSecurity: 'none' }, {}).secure).toBe(false);
    expect(buildFtpAccessOptions({ ...ftpProfile, ftpSecurity: 'explicit' }, {}).secure).toBe(true);
    expect(buildFtpAccessOptions({ ...ftpProfile, ftpSecurity: 'implicit' }, {}).secure).toBe('implicit');
  });

  it('buildSftpConnectConfig maps key/passphrase from secrets and username from profile', () => {
    const cfg = buildSftpConnectConfig(sftpProfile, { privateKey: 'KEY', passphrase: 'pp' });
    expect(cfg).toEqual({ host: 'h', port: 22, username: 'u', privateKey: 'KEY', passphrase: 'pp' });
  });

  it('buildSftpConnectConfig includes hostVerifier when provided, and omits it otherwise', () => {
    const hv: HostVerifierFn = (_key, cb) => cb(true);
    const withHv = buildSftpConnectConfig(sftpProfile, { password: 'pw' }, hv);
    expect((withHv as Record<string, unknown>).hostVerifier).toBe(hv);
    expect((withHv as Record<string, unknown>).password).toBe('pw');

    const withoutHv = buildSftpConnectConfig(sftpProfile, { password: 'pw' });
    expect('hostVerifier' in withoutHv).toBe(false);
  });

  it('buildS3ClientConfig includes credentials when the secret is present', () => {
    const cfg = buildS3ClientConfig(s3Profile, { secretAccessKey: 'sk' });
    expect(cfg).toEqual({
      region: 'ap-northeast-1',
      credentials: { accessKeyId: 'AKIA', secretAccessKey: 'sk' },
    });
  });

  it('buildS3ClientConfig omits credentials when the secret is missing', () => {
    const cfg = buildS3ClientConfig(s3Profile, {});
    expect(cfg).toEqual({ region: 'ap-northeast-1' });
  });
});

describe('createTransport', () => {
  it('returns an FtpTransport for ftp profiles', () => {
    const { deps } = makeDeps();
    expect(createTransport(ftpProfile, { password: 'pw' }, deps)).toBeInstanceOf(FtpTransport);
  });

  it('returns an SftpTransport for sftp profiles', () => {
    const { deps } = makeDeps();
    expect(createTransport(sftpProfile, { privateKey: 'KEY' }, deps)).toBeInstanceOf(SftpTransport);
  });

  it('asks deps.makeSftpHostVerifier for a verifier for sftp profiles', () => {
    const { deps } = makeDeps();
    const seen: SftpProfile[] = [];
    const hv: HostVerifierFn = (_key, cb) => cb(true);
    deps.makeSftpHostVerifier = (profile) => {
      seen.push(profile);
      return hv;
    };
    createTransport(sftpProfile, { privateKey: 'KEY' }, deps);
    expect(seen).toEqual([sftpProfile]);
  });

  it('returns an S3Transport and passes credentials into the client config', () => {
    const { deps, s3Configs } = makeDeps();
    const t = createTransport(s3Profile, { secretAccessKey: 'sk' }, deps);
    expect(t).toBeInstanceOf(S3Transport);
    expect(s3Configs).toEqual([
      { region: 'ap-northeast-1', credentials: { accessKeyId: 'AKIA', secretAccessKey: 'sk' } },
    ]);
  });
});
