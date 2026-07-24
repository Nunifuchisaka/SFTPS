import { DEFAULT_BACKUP_RETENTION, type BackupRetention } from '../backup/retention';
// 差分ライブラリ本体をレンダラへ持ち込まないよう、定数だけのモジュールから読む。
import { DEFAULT_MAX_DIFF_BYTES } from '../diff/limits';
import { normalizeExtensionList } from '../upload/extension-filter';

/** アプリ全体の設定（プロファイルに紐づかない、ユーザー単位の方針）。 */
export interface AppSettings {
  /** バックアップの保持ポリシー。 */
  backup: BackupRetention;
  /** 差分プレビューの制限。 */
  diff: {
    /** 文字差分を行う上限バイト数。超過分はサイズ比較へフォールバックする。 */
    maxBytes: number;
  };
  /** アップロードを許可する拡張子の制限（有効時、リストにない拡張子はアップロードされない）。 */
  uploadExtensionFilter: {
    enabled: boolean;
    /** 正規化済み拡張子リスト（小文字・先頭ドットなし）。空なら実質無制限。 */
    extensions: string[];
  };
}

export const MIN_DIFF_MAX_BYTES = 1024;
export const MAX_DIFF_MAX_BYTES = 64 * 1024 * 1024;
export const MAX_BACKUP_GENERATIONS = 1000;
export const MAX_BACKUP_AGE_DAYS = 3650;

export const DEFAULT_SETTINGS: AppSettings = {
  backup: { ...DEFAULT_BACKUP_RETENTION },
  diff: { maxBytes: DEFAULT_MAX_DIFF_BYTES },
  uploadExtensionFilter: { enabled: false, extensions: [] },
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 整数へ丸めて範囲に収める。数値でなければ fallback。 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * 任意の入力（設定ファイル・IPC 引数）を、安全な範囲の設定へ正規化する純粋関数。
 * 未知フィールドは落とし、壊れた値は既定へ倒す（フェイルセーフ）。
 */
export function normalizeSettings(input: unknown): AppSettings {
  const root = record(input);
  const backup = record(root['backup']);
  const diff = record(root['diff']);
  const uploadExtensionFilter = record(root['uploadExtensionFilter']);

  const rawAge = backup['maxAgeDays'];
  const maxAgeDays =
    typeof rawAge === 'number' && Number.isFinite(rawAge) && Math.trunc(rawAge) > 0
      ? Math.min(MAX_BACKUP_AGE_DAYS, Math.trunc(rawAge))
      : null;

  return {
    backup: {
      maxGenerations: clampInt(
        backup['maxGenerations'],
        1,
        MAX_BACKUP_GENERATIONS,
        DEFAULT_SETTINGS.backup.maxGenerations,
      ),
      maxAgeDays,
    },
    diff: {
      maxBytes: clampInt(
        diff['maxBytes'],
        MIN_DIFF_MAX_BYTES,
        MAX_DIFF_MAX_BYTES,
        DEFAULT_SETTINGS.diff.maxBytes,
      ),
    },
    uploadExtensionFilter: {
      enabled: uploadExtensionFilter['enabled'] === true,
      extensions: normalizeExtensionList(uploadExtensionFilter['extensions']),
    },
  };
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(normalizeSettings(settings), null, 2);
}

/** 設定 JSON を読む。壊れていても起動を止めず既定へ倒す（機微情報は含まないため）。 */
export function parseSettings(json: string): AppSettings {
  try {
    return normalizeSettings(JSON.parse(json));
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      backup: { ...DEFAULT_SETTINGS.backup },
      diff: { ...DEFAULT_SETTINGS.diff },
      uploadExtensionFilter: {
        ...DEFAULT_SETTINGS.uploadExtensionFilter,
        extensions: [...DEFAULT_SETTINGS.uploadExtensionFilter.extensions],
      },
    };
  }
}
