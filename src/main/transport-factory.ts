import ftp from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { S3Client } from '@aws-sdk/client-s3';
import {
  FtpTransport,
  SftpTransport,
  S3Transport,
  type FtpClientLike,
  type SftpClientLike,
  type S3ClientLike,
  type RemoteTransport,
} from '../core/transport/index';
import type { FtpProfile, Profile, S3Profile, SftpProfile } from '../core/profile/index';

export type Secrets = Record<string, string>;

export interface S3ClientConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

/** プロトコルごとの実クライアント生成を差し替え可能にするための依存注入口。 */
export interface TransportFactoryDeps {
  createFtpClient(): FtpClientLike;
  createSftpClient(): SftpClientLike;
  createS3Client(config: S3ClientConfig): S3ClientLike;
}

/** basic-ftp の access() へ渡す接続オプションを組み立てる。 */
export function buildFtpAccessOptions(profile: FtpProfile, secrets: Secrets) {
  return {
    host: profile.host,
    port: profile.port,
    user: profile.user,
    password: secrets.password ?? '',
    secure: profile.secure ?? false,
  };
}

/** ssh2-sftp-client の connect() へ渡す設定を組み立てる。 */
export function buildSftpConnectConfig(profile: SftpProfile, secrets: Secrets) {
  const config: Record<string, unknown> = {
    host: profile.host,
    port: profile.port,
    username: profile.user,
  };
  if (secrets.password) config.password = secrets.password;
  if (secrets.privateKey) config.privateKey = secrets.privateKey;
  if (secrets.passphrase) config.passphrase = secrets.passphrase;
  return config;
}

/** S3Client のコンストラクタへ渡す設定を組み立てる。シークレット未設定なら既定の資格情報チェーンに委ねる。 */
export function buildS3ClientConfig(profile: S3Profile, secrets: Secrets): S3ClientConfig {
  const config: S3ClientConfig = { region: profile.region };
  if (profile.accessKeyId && secrets.secretAccessKey) {
    config.credentials = {
      accessKeyId: profile.accessKeyId,
      secretAccessKey: secrets.secretAccessKey,
    };
    if (secrets.sessionToken) {
      config.credentials.sessionToken = secrets.sessionToken;
    }
  }
  return config;
}

/**
 * 実クライアント → フェーズAの最小インタフェースへの結線点。
 * ライブラリの実型と最小構造型の差異（例: SFTP get のオーバーロード）は
 * この境界で `as unknown as` によって吸収する。
 */
export const defaultTransportDeps: TransportFactoryDeps = {
  createFtpClient: () => new ftp.Client() as unknown as FtpClientLike,
  createSftpClient: () => new SftpClient() as unknown as SftpClientLike,
  createS3Client: (config) => new S3Client(config) as unknown as S3ClientLike,
};

/**
 * プロファイルとシークレットから、対応する RemoteTransport を生成する。
 * 実接続は connect() を呼ぶまで行わない。
 */
export function createTransport(
  profile: Profile,
  secrets: Secrets,
  deps: TransportFactoryDeps = defaultTransportDeps,
): RemoteTransport {
  switch (profile.protocol) {
    case 'ftp':
      return new FtpTransport(deps.createFtpClient(), buildFtpAccessOptions(profile, secrets));
    case 'sftp':
      return new SftpTransport(deps.createSftpClient(), buildSftpConnectConfig(profile, secrets));
    case 's3':
      return new S3Transport(
        deps.createS3Client(buildS3ClientConfig(profile, secrets)),
        profile.bucket,
      );
  }
}
