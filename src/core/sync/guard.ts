import type { SyncAction } from './types';

export type SyncDestinationLevel = 'ok' | 'warn' | 'error';

export interface SyncDestinationCheck {
  /** 同期を実行してよいか（level='error' なら false）。 */
  ok: boolean;
  level: SyncDestinationLevel;
  /** 利用者へ提示する警告・拒否理由（level='ok' なら空文字）。 */
  message: string;
}

/** 確認ダイアログに列挙する削除対象パスの上限。 */
const MAX_LISTED_PATHS = 10;

/** 空文字や連続スラッシュがサーバールートに解決されるかを判定する。 */
function isServerRoot(remoteDir: string): boolean {
  const trimmed = remoteDir.trim();
  return trimmed !== '' && /^\/+$/.test(trimmed);
}

/**
 * 同期先リモートディレクトリを検証する純粋関数。
 * 空欄は posix 正規化でサーバールート起点になるため常に拒否し、
 * 明示的なルート指定はミラー削除有効時のみ拒否・無効時は警告に留める。
 */
export function validateSyncDestination(
  remoteDir: string,
  options: { deleteExtraneous?: boolean } = {},
): SyncDestinationCheck {
  if (remoteDir.trim() === '') {
    return {
      ok: false,
      level: 'error',
      message:
        '同期先リモートディレクトリが空です。空欄はサーバールート（/）起点として扱われ危険なため、明示的に指定してください。',
    };
  }

  if (isServerRoot(remoteDir)) {
    if (options.deleteExtraneous) {
      return {
        ok: false,
        level: 'error',
        message:
          'ミラー削除が有効な状態でサーバールート（/）を同期先にはできません。サーバー全体が削除対象になります。',
      };
    }
    return {
      ok: true,
      level: 'warn',
      message: '同期先がサーバールート（/）です。意図した指定か確認してください。',
    };
  }

  return { ok: true, level: 'ok', message: '' };
}

export interface MirrorDeletionConfirm {
  requiresConfirm: boolean;
  /** delete-extra の件数。 */
  count: number;
  /** 提示する削除対象パス（先頭 10 件まで）。 */
  paths: string[];
  message: string;
}

/**
 * ミラー削除（delete-extra）の実行前確認メッセージを組み立てる純粋ガード関数。
 * 削除件数・宛先・対象パスを提示し、削除が 1 件でもあれば確認を必須とする。
 */
export function confirmMirrorDeletion(plan: SyncAction[], destBase: string): MirrorDeletionConfirm {
  const targets = plan.filter((a) => a.type === 'delete-extra').map((a) => a.path);
  if (targets.length === 0) {
    return { requiresConfirm: false, count: 0, paths: [], message: '削除対象がありません' };
  }

  const paths = targets.slice(0, MAX_LISTED_PATHS);
  const rest = targets.length - paths.length;
  const listed = paths.map((p) => `・${p}`).join('\n') + (rest > 0 ? `\nほか ${rest} 件` : '');

  return {
    requiresConfirm: true,
    count: targets.length,
    paths,
    message:
      `ミラー削除: 「${destBase}」配下のリモートファイル ${targets.length} 件を削除します。\n` +
      `${listed}\n` +
      '削除前にバックアップを取りますが、リモートからは失われます。実行してよろしいですか？',
  };
}
