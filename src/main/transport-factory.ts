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
import {
  resolveFtpSecurity,
  type FtpProfile,
  type FtpSecurity,
  type Profile,
  type S3Profile,
  type SftpProfile,
} from '../core/profile/index';
import { resolveS3Credentials } from '../core/profile/s3-credentials';
import type { HostVerifierFn } from '../core/hostkey/index';

export type Secrets = Record<string, string>;

export interface S3ClientConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  requestHandler?: {
    connectionTimeout: number;
    requestTimeout: number;
  };
}

/** プロトコルごとの実クライアント生成を差し替え可能にするための依存注入口。 */
export interface TransportFactoryDeps {
  /**
   * basic-ftp はタイムアウトを access() オプションではなく Client の
   * コンストラクタで受け取るため、生成時に渡す（未指定ならライブラリ既定の 30 秒）。
   */
  createFtpClient(connectTimeoutMs?: number): FtpClientLike;
  createSftpClient(): SftpClientLike;
  createS3Client(config: S3ClientConfig): S3ClientLike;
  /** SFTP プロファイルに対するホスト鍵検証関数を生成する（未指定なら検証なし）。 */
  makeSftpHostVerifier?: (profile: SftpProfile) => HostVerifierFn;
}

/** FTP の TLS モードを basic-ftp の secure 値へ変換する。 */
function toBasicFtpSecure(mode: FtpSecurity): boolean | 'implicit' {
  switch (mode) {
    case 'none':
      return false;
    case 'explicit':
      return true;
    case 'implicit':
      return 'implicit';
  }
}

/** basic-ftp の access() へ渡す接続オプションを組み立てる。 */
export function buildFtpAccessOptions(profile: FtpProfile, secrets: Secrets) {
  // タイムアウトはここには含めない（basic-ftp の AccessOptions に timeout は
  // 存在せず黙って無視される。createFtpClient のコンストラクタ引数で渡す）。
  return {
    host: profile.host,
    port: profile.port,
    user: profile.user,
    password: secrets.password ?? '',
    secure: toBasicFtpSecure(resolveFtpSecurity(profile)),
  };
}

/** ssh2-sftp-client の connect() へ渡す設定を組み立てる。 */
export function buildSftpConnectConfig(
  profile: SftpProfile,
  secrets: Secrets,
  hostVerifier?: HostVerifierFn,
) {
  const config: Record<string, unknown> = {
    host: profile.host,
    port: profile.port,
    username: profile.user,
  };
  if (secrets.password) config.password = secrets.password;
  if (secrets.privateKey) config.privateKey = secrets.privateKey;
  if (secrets.passphrase) config.passphrase = secrets.passphrase;
  if (hostVerifier) config.hostVerifier = hostVerifier;
  if (profile.connectTimeoutMs !== undefined) config.readyTimeout = profile.connectTimeoutMs;
  return config;
}

/**
 * S3Client のコンストラクタへ渡す設定を組み立てる。
 * 資格情報が未設定で「マシンの既定資格情報を使う」もオフなら、
 * 既定チェーン（環境変数 / ~/.aws / IMDS）へ黙って落ちずに接続を拒否する。
 */
export function buildS3ClientConfig(profile: S3Profile, secrets: Secrets): S3ClientConfig {
  const config: S3ClientConfig = { region: profile.region };
  const resolved = resolveS3Credentials(profile, secrets);
  if (resolved.mode === 'missing') throw new Error(resolved.reason);
  if (resolved.mode === 'explicit') config.credentials = resolved.credentials;
  if (profile.connectTimeoutMs !== undefined) {
    config.requestHandler = {
      connectionTimeout: profile.connectTimeoutMs,
      requestTimeout: profile.connectTimeoutMs,
    };
  }
  return config;
}

/**
 * 実クライアント → フェーズAの最小インタフェースへの結線点。
 * ライブラリの実型と最小構造型の差異（例: SFTP get のオーバーロード）は
 * この境界で `as unknown as` によって吸収する。
 */
export const defaultTransportDeps: TransportFactoryDeps = {
  createFtpClient: (connectTimeoutMs) => new ftp.Client(connectTimeoutMs) as unknown as FtpClientLike,
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
      return new FtpTransport(
        deps.createFtpClient(profile.connectTimeoutMs),
        buildFtpAccessOptions(profile, secrets),
      );
    case 'sftp': {
      const hostVerifier = deps.makeSftpHostVerifier?.(profile);
      return new SftpTransport(
        deps.createSftpClient(),
        buildSftpConnectConfig(profile, secrets, hostVerifier),
      );
    }
    case 's3':
      return new S3Transport(
        deps.createS3Client(buildS3ClientConfig(profile, secrets)),
        profile.bucket,
      );
  }
}
