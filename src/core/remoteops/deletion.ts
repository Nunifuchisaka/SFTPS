import type { RemoteEntry } from '../transport/index';

/**
 * FTP の removeDir('/') は接続先全体を再帰削除するため、削除APIへ渡してはならない
 * ルート相当パスを判定する。`.` / `..` を解決した結果がルートになる表現も拒否する。
 */
export function isDangerousRemoteDeletionTarget(remotePath: string): boolean {
  if (typeof remotePath !== 'string' || remotePath.trim() === '') return true;
  const segments = remotePath.trim().replace(/\\/g, '/').split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) return true;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.length === 0;
}

export function assertSafeRemoteDeletionTarget(remotePath: string): void {
  if (isDangerousRemoteDeletionTarget(remotePath)) {
    throw new Error('refusing to delete the remote root or an empty remote path');
  }
}

export interface DeletionConfirm {
  requiresConfirm: boolean;
  message: string;
  count: number;
}

/**
 * 削除操作の確認要否とメッセージを返す純粋ガード関数。
 * ディレクトリ削除（再帰）や複数削除では強めの警告文にする。
 */
export function confirmDeletion(entries: RemoteEntry[]): DeletionConfirm {
  const count = entries.length;
  if (count === 0) {
    return { requiresConfirm: false, message: '削除対象がありません', count: 0 };
  }

  const dirCount = entries.filter((e) => e.type === 'dir').length;

  let message: string;
  if (count === 1) {
    const only = entries[0];
    message =
      only.type === 'dir'
        ? `ディレクトリ「${only.name}」を再帰的に削除します。よろしいですか？`
        : `「${only.name}」を削除します。よろしいですか？`;
  } else {
    const dirNote = dirCount > 0 ? `（うちディレクトリ ${dirCount} 件を再帰削除）` : '';
    message = `${count} 件を削除します${dirNote}。よろしいですか？`;
  }

  return { requiresConfirm: true, message, count };
}
