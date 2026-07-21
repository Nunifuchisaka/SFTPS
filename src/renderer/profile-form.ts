import {
  resolveFtpSecurity,
  type FtpSecurity,
  type Profile,
  type Protocol,
} from '../core/profile/index';

/** プロファイル編集フォームのフラットな値表現。protocol ごとの全項目を含む。 */
export interface FormValues {
  protocol: Protocol;
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  ftpSecurity: FtpSecurity;
  privateKey: string;
  passphrase: string;
  hostKeyPolicy: 'tofu' | 'strict';
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 接続タイムアウト（ミリ秒）。空文字＝未設定。 */
  connectTimeoutMs: string;
  autoReconnect: boolean;
}

/** 新規作成用の既定フォーム値（安全側の既定: ftpSecurity=explicit, hostKeyPolicy=tofu）。 */
export function emptyFormValues(): FormValues {
  return {
    protocol: 'ftp',
    id: '',
    name: '',
    host: '',
    port: 21,
    user: '',
    password: '',
    ftpSecurity: 'explicit',
    privateKey: '',
    passphrase: '',
    hostKeyPolicy: 'tofu',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    connectTimeoutMs: '',
    autoReconnect: false,
  };
}

/**
 * 既存プロファイルをフォーム値へ変換する（編集ロード用）。
 * シークレット欄は決してロードしない（空欄のまま＝据え置き）。
 */
export function profileToFormValues(profile: Profile): FormValues {
  const fv = emptyFormValues();
  fv.protocol = profile.protocol;
  fv.id = profile.id;
  fv.name = profile.name;
  if (profile.connectTimeoutMs !== undefined) fv.connectTimeoutMs = String(profile.connectTimeoutMs);
  fv.autoReconnect = profile.autoReconnect ?? false;

  if (profile.protocol === 'ftp') {
    fv.host = profile.host;
    fv.port = profile.port;
    fv.user = profile.user;
    fv.ftpSecurity = resolveFtpSecurity(profile);
  } else if (profile.protocol === 'sftp') {
    fv.host = profile.host;
    fv.port = profile.port;
    fv.user = profile.user;
    fv.hostKeyPolicy = profile.hostKeyPolicy ?? 'tofu';
  } else {
    fv.region = profile.region;
    fv.bucket = profile.bucket;
    fv.accessKeyId = profile.accessKeyId ?? '';
  }
  return fv;
}

/**
 * フォーム値からプロファイルを構築する。
 * 空欄のシークレットは省略する（＝AppService 側で既存シークレット据え置き）。
 */
export function buildProfileFromForm(v: FormValues): Profile {
  const timeout = v.connectTimeoutMs.trim() !== '' ? Number(v.connectTimeoutMs) : undefined;
  const common = {
    ...(timeout !== undefined && !Number.isNaN(timeout) ? { connectTimeoutMs: timeout } : {}),
    ...(v.autoReconnect ? { autoReconnect: true } : {}),
  };

  if (v.protocol === 'ftp') {
    return {
      id: v.id,
      name: v.name,
      protocol: 'ftp',
      host: v.host,
      port: v.port,
      user: v.user,
      ftpSecurity: v.ftpSecurity,
      ...common,
      ...(v.password ? { password: v.password } : {}),
    };
  }
  if (v.protocol === 'sftp') {
    return {
      id: v.id,
      name: v.name,
      protocol: 'sftp',
      host: v.host,
      port: v.port,
      user: v.user,
      hostKeyPolicy: v.hostKeyPolicy,
      ...common,
      ...(v.password ? { password: v.password } : {}),
      ...(v.privateKey ? { privateKey: v.privateKey } : {}),
      ...(v.passphrase ? { passphrase: v.passphrase } : {}),
    };
  }
  return {
    id: v.id,
    name: v.name,
    protocol: 's3',
    region: v.region,
    bucket: v.bucket,
    ...common,
    ...(v.accessKeyId ? { accessKeyId: v.accessKeyId } : {}),
    ...(v.secretAccessKey ? { secretAccessKey: v.secretAccessKey } : {}),
  };
}
