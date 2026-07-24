export type Protocol = 'ftp' | 'sftp' | 's3';

/** FTP の TLS モード。none=平文 / explicit=AUTH TLS / implicit=暗黙TLS。 */
export type FtpSecurity = 'none' | 'explicit' | 'implicit';

/** 一覧画面でのフォルダ分け・並び順の共通フィールド。全プロトコル共通。 */
export interface ProfileOrganization {
  /** 所属フォルダの id。未指定/undefined = 未整理（フォルダなし）。 */
  folderId?: string;
  /** 同一グループ（同じ folderId、または未整理）内での表示順。 */
  order?: number;
}

export interface FtpProfile extends ProfileOrganization {
  id: string;
  name: string;
  protocol: 'ftp';
  host: string;
  port: number;
  user: string;
  /** TLS モード。未指定時は secure(旧) → 既定 explicit の順で解決される。 */
  ftpSecurity?: FtpSecurity;
  /** @deprecated ftpSecurity へ移行。true=explicit 相当の後方互換フラグ。 */
  secure?: boolean;
  /** 接続タイムアウト（ミリ秒）。 */
  connectTimeoutMs?: number;
  /** 切断検知時に自動再接続を試みるか。 */
  autoReconnect?: boolean;
  /** シークレット（JSON へは保存しない）。 */
  password?: string;
}

export interface SftpProfile extends ProfileOrganization {
  id: string;
  name: string;
  protocol: 'sftp';
  host: string;
  port: number;
  user: string;
  /** ホスト鍵検証ポリシー。tofu=初回信頼して記録 / strict=既知の鍵のみ受理。既定 tofu。 */
  hostKeyPolicy?: 'tofu' | 'strict';
  /** 接続タイムアウト（ミリ秒）。 */
  connectTimeoutMs?: number;
  /** 切断検知時に自動再接続を試みるか。 */
  autoReconnect?: boolean;
  /** シークレット（JSON へは保存しない）。 */
  password?: string;
  /** シークレット（JSON へは保存しない）。 */
  privateKey?: string;
  /** シークレット（JSON へは保存しない）。 */
  passphrase?: string;
}

export interface S3Profile extends ProfileOrganization {
  id: string;
  name: string;
  protocol: 's3';
  region: string;
  bucket: string;
  /** 識別子。ユーザー名相当のため保存する。 */
  accessKeyId?: string;
  /**
   * 資格情報未設定時に AWS SDK の既定チェーン（環境変数 / ~/.aws / IMDS）を使うか。
   * 明示オプトインした場合のみ true。既定（未設定）では接続を拒否する。
   */
  useDefaultCredentials?: boolean;
  /** 接続タイムアウト（ミリ秒）。 */
  connectTimeoutMs?: number;
  /** 切断検知時に自動再接続を試みるか。 */
  autoReconnect?: boolean;
  /** シークレット（JSON へは保存しない）。 */
  secretAccessKey?: string;
  /** シークレット（JSON へは保存しない）。 */
  sessionToken?: string;
}

export type Profile = FtpProfile | SftpProfile | S3Profile;

/** JSON へ保存してはならないシークレットフィールド名。 */
export const SECRET_KEYS = [
  'password',
  'privateKey',
  'passphrase',
  'secretAccessKey',
  'sessionToken',
] as const;

/**
 * FTP プロファイルの実効 TLS モードを解決する（純粋関数）。
 * 優先順位: 明示の ftpSecurity → 旧 secure ブール → 既定 'explicit'（安全側）。
 */
export function resolveFtpSecurity(profile: FtpProfile): FtpSecurity {
  if (profile.ftpSecurity !== undefined) return profile.ftpSecurity;
  if (profile.secure === true) return 'explicit';
  if (profile.secure === false) return 'none';
  return 'explicit';
}

/**
 * プロファイル ID に許可する文字。
 * ID はバックアップ保存先のディレクトリ名としてそのままパスに使われるため、
 * パス区切り・親ディレクトリ参照・ドライブレター等を作れない文字集合に限定する。
 */
const PROFILE_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** プロファイル ID がファイルパス構成要素として安全か判定する（純粋関数）。 */
export function isValidProfileId(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (id === '.' || id === '..') return false; // 文字集合は満たすがディレクトリ参照になる
  return PROFILE_ID_RE.test(id);
}

/** S3 バケット名の命名規則を検証する。 */
function isValidBucketName(name: string): boolean {
  if (name.length < 3 || name.length > 63) return false;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) return false;
  if (name.includes('..')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return false; // IP アドレス形式は不可
  return true;
}

/** プロファイルを検証し、問題があればエラーメッセージ配列を返す（空配列 = 妥当）。 */
export function validateProfile(profile: Profile): string[] {
  const errors: string[] = [];
  if (!profile.id?.trim()) errors.push('id is required');
  else if (!isValidProfileId(profile.id)) {
    errors.push('id must be 1-64 chars of A-Z a-z 0-9 . _ - (no path separators)');
  }
  if (!profile.name?.trim()) errors.push('name is required');

  switch (profile.protocol) {
    case 'ftp':
    case 'sftp':
      if (!profile.host?.trim()) errors.push('host is required');
      if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
        errors.push('port must be an integer between 1 and 65535');
      }
      if (!profile.user?.trim()) errors.push('user is required');
      if (
        profile.protocol === 'ftp' &&
        profile.ftpSecurity !== undefined &&
        profile.ftpSecurity !== 'none' &&
        profile.ftpSecurity !== 'explicit' &&
        profile.ftpSecurity !== 'implicit'
      ) {
        errors.push('ftpSecurity must be "none", "explicit" or "implicit"');
      }
      if (
        profile.protocol === 'sftp' &&
        profile.hostKeyPolicy !== undefined &&
        profile.hostKeyPolicy !== 'tofu' &&
        profile.hostKeyPolicy !== 'strict'
      ) {
        errors.push('hostKeyPolicy must be "tofu" or "strict"');
      }
      break;
    case 's3':
      if (!profile.region?.trim()) errors.push('region is required');
      if (!isValidBucketName(profile.bucket ?? '')) {
        errors.push('bucket must be a valid S3 bucket name');
      }
      break;
  }

  if (
    profile.connectTimeoutMs !== undefined &&
    (!Number.isInteger(profile.connectTimeoutMs) ||
      profile.connectTimeoutMs <= 0 ||
      profile.connectTimeoutMs > 600_000)
  ) {
    errors.push('connectTimeoutMs must be a positive integer up to 600000');
  }

  if (profile.folderId !== undefined && typeof profile.folderId !== 'string') {
    errors.push('folderId must be a string');
  }
  if (profile.order !== undefined && !Number.isInteger(profile.order)) {
    errors.push('order must be an integer');
  }

  return errors;
}

/** シークレットフィールドを取り除いた複製を返す。 */
export function stripSecrets<T extends Profile>(profile: T): T {
  const clone: Record<string, unknown> = { ...profile };
  for (const key of SECRET_KEYS) delete clone[key];
  return clone as T;
}

export type SecretUpdateAction = 'keep' | 'update' | 'clear';

/**
 * 編集フォームのシークレット欄から、保存時のシークレット更新方針を決める純粋関数。
 * - 入力あり → update（新しい値で上書き）
 * - 空欄 → keep（既存を据え置き。空欄で既存シークレットを誤って消さない）
 * - 明示クリア要求時のみ → clear
 */
export function resolveSecretUpdate(
  formValue: string,
  existingHadSecret: boolean,
  explicitClear = false,
): { action: SecretUpdateAction } {
  if (explicitClear && existingHadSecret) return { action: 'clear' };
  if (formValue.trim() !== '') return { action: 'update' };
  return { action: 'keep' };
}

/** シークレットフィールド名。 */
export type SecretKey = (typeof SECRET_KEYS)[number];

/**
 * 既存シークレットと入力シークレットを項目ごとにマージする純粋関数。
 * 判定は resolveSecretUpdate に委ね、keep=既存据え置き / update=上書き / clear=削除。
 * clearKeys に含まれる項目は入力値があっても空欄扱いとし、明示クリアを優先する。
 */
export function mergeSecrets(
  existing: Record<string, string>,
  incoming: Record<string, string>,
  clearKeys: readonly string[] = [],
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const key of SECRET_KEYS) {
    const explicitClear = clearKeys.includes(key);
    const formValue = explicitClear ? '' : (incoming[key] ?? '');
    const existingValue = existing[key];
    const { action } = resolveSecretUpdate(formValue, existingValue !== undefined, explicitClear);
    if (action === 'update') merged[key] = formValue;
    else if (action === 'keep' && existingValue !== undefined) merged[key] = existingValue;
  }
  return merged;
}

/** プロファイルからシークレットフィールドのみを抽出する（値が設定されているもののみ）。 */
export function extractSecrets(profile: Profile): Record<string, string> {
  const source = profile as unknown as Record<string, unknown>;
  const secrets: Record<string, string> = {};
  for (const key of SECRET_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') {
      secrets[key] = value;
    }
  }
  return secrets;
}

/** 保存対象オブジェクトにシークレットが混入していれば例外を投げる。 */
export function assertNoSecrets(obj: Record<string, unknown>): void {
  for (const key of SECRET_KEYS) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') {
      throw new Error(`secret field "${key}" must not be persisted to profile JSON`);
    }
  }
}

/** プロファイル配列を、シークレットを除いた JSON 文字列へ直列化する。 */
export function serializeProfiles(profiles: Profile[]): string {
  const safe = profiles.map((profile) => {
    const stripped = stripSecrets(profile);
    assertNoSecrets(stripped as unknown as Record<string, unknown>); // 二重防御
    return stripped;
  });
  return JSON.stringify(safe, null, 2);
}

/** シークレット混入の検知報告（値は含めない）。 */
export interface SecretContaminationReport {
  index: number;
  id: string;
  keys: SecretKey[];
}

export interface ParseProfilesOptions {
  /** シークレット混入を検知したときの通知。既定は console.warn（値は出さない）。 */
  onSecretDetected?: (report: SecretContaminationReport) => void;
}

/** オブジェクトに含まれているシークレットフィールド名を列挙する（値は返さない）。 */
function detectSecretKeys(obj: Record<string, unknown>): SecretKey[] {
  return SECRET_KEYS.filter((key) => {
    const value = obj[key];
    return value !== undefined && value !== null && value !== '';
  });
}

function warnSecretContamination(report: SecretContaminationReport): void {
  console.warn(
    `profiles JSON contained secret field(s) [${report.keys.join(', ')}] for profile "${report.id}"; stripped on load`,
  );
}

/**
 * JSON 文字列からプロファイル配列を復元し、各要素を検証する。
 * 旧版・手編集・移行等でシークレットが混入していても、
 * 直列化側と同じく stripSecrets＋assertNoSecrets の二重防御を通してから返す
 * （混入はキー名のみログに残し、値は決して残さない）。
 */
export function parseProfiles(json: string, options: ParseProfilesOptions = {}): Profile[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error('profiles JSON must be an array');
  const onSecretDetected = options.onSecretDetected ?? warnSecretContamination;

  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`profile[${index}] is not an object`);
    }
    const protocol = (item as { protocol?: unknown }).protocol;
    if (protocol !== 'ftp' && protocol !== 'sftp' && protocol !== 's3') {
      throw new Error(`profile[${index}] has an invalid protocol`);
    }
    const profile = item as Profile;
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      throw new Error(`profile[${index}] is invalid: ${errors.join(', ')}`);
    }

    const contaminated = detectSecretKeys(profile as unknown as Record<string, unknown>);
    if (contaminated.length > 0) {
      onSecretDetected({ index, id: profile.id, keys: contaminated });
    }
    const stripped = stripSecrets(profile);
    assertNoSecrets(stripped as unknown as Record<string, unknown>); // 二重防御
    return stripped;
  });
}
