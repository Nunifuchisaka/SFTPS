import type { FtpSecurity, Protocol } from '../profile/index';

/**
 * .env から読み込む「機密情報を含まない」プロファイルの初期値。
 * SECRET_KEYS（password/privateKey/passphrase/secretAccessKey/sessionToken）は
 * 意図的にここへ含めない（ENV_KEY_MAP に対応キーが存在しないため原理的に読み込めない）。
 */
export interface ProfileDefaults {
  protocol?: Protocol;
  host?: string;
  port?: number;
  user?: string;
  ftpSecurity?: FtpSecurity;
  hostKeyPolicy?: 'tofu' | 'strict';
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  connectTimeoutMs?: number;
  autoReconnect?: boolean;
}

/**
 * .env ファイルの内容（KEY=VALUE 形式）を素朴にパースする（純粋関数）。
 * コメント行（#）・空行はスキップし、値を囲む引用符（' または "）は除去する。
 * dotenv 等のライブラリは使わず、この用途に必要な最小限のみを実装する。
 */
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** .env 側のキー名。ここに存在しないフィールド（シークレット）は読み込み対象になり得ない。 */
const ENV_KEY_MAP = {
  protocol: 'FUNABIN_DEFAULT_PROTOCOL',
  host: 'FUNABIN_DEFAULT_HOST',
  port: 'FUNABIN_DEFAULT_PORT',
  user: 'FUNABIN_DEFAULT_USER',
  ftpSecurity: 'FUNABIN_DEFAULT_FTP_SECURITY',
  hostKeyPolicy: 'FUNABIN_DEFAULT_HOST_KEY_POLICY',
  region: 'FUNABIN_DEFAULT_REGION',
  bucket: 'FUNABIN_DEFAULT_BUCKET',
  accessKeyId: 'FUNABIN_DEFAULT_ACCESS_KEY_ID',
  connectTimeoutMs: 'FUNABIN_DEFAULT_CONNECT_TIMEOUT_MS',
  autoReconnect: 'FUNABIN_DEFAULT_AUTO_RECONNECT',
} as const;

const VALID_PROTOCOLS: readonly Protocol[] = ['ftp', 'sftp', 's3'];
const VALID_FTP_SECURITY: readonly FtpSecurity[] = ['none', 'explicit', 'implicit'];

/**
 * .env の環境変数マップから、機密情報を含まないプロファイル初期値のみを抽出する（純粋関数）。
 * 不正な値（範囲外の列挙値・非数値等）はその項目だけ無視し、他の項目には影響しない。
 */
export function buildProfileDefaults(env: Record<string, string>): ProfileDefaults {
  const defaults: ProfileDefaults = {};

  const protocol = env[ENV_KEY_MAP.protocol];
  if (protocol && VALID_PROTOCOLS.includes(protocol as Protocol)) {
    defaults.protocol = protocol as Protocol;
  }

  const host = env[ENV_KEY_MAP.host];
  if (host) defaults.host = host;

  const port = env[ENV_KEY_MAP.port];
  if (port !== undefined && port !== '' && Number.isInteger(Number(port))) {
    defaults.port = Number(port);
  }

  const user = env[ENV_KEY_MAP.user];
  if (user) defaults.user = user;

  const ftpSecurity = env[ENV_KEY_MAP.ftpSecurity];
  if (ftpSecurity && VALID_FTP_SECURITY.includes(ftpSecurity as FtpSecurity)) {
    defaults.ftpSecurity = ftpSecurity as FtpSecurity;
  }

  const hostKeyPolicy = env[ENV_KEY_MAP.hostKeyPolicy];
  if (hostKeyPolicy === 'tofu' || hostKeyPolicy === 'strict') {
    defaults.hostKeyPolicy = hostKeyPolicy;
  }

  const region = env[ENV_KEY_MAP.region];
  if (region) defaults.region = region;

  const bucket = env[ENV_KEY_MAP.bucket];
  if (bucket) defaults.bucket = bucket;

  const accessKeyId = env[ENV_KEY_MAP.accessKeyId];
  if (accessKeyId) defaults.accessKeyId = accessKeyId;

  const connectTimeoutMs = env[ENV_KEY_MAP.connectTimeoutMs];
  if (
    connectTimeoutMs !== undefined &&
    connectTimeoutMs !== '' &&
    Number.isInteger(Number(connectTimeoutMs))
  ) {
    defaults.connectTimeoutMs = Number(connectTimeoutMs);
  }

  const autoReconnect = env[ENV_KEY_MAP.autoReconnect];
  if (autoReconnect === 'true') defaults.autoReconnect = true;

  return defaults;
}
