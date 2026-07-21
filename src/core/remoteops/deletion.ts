import type { RemoteEntry } from '../transport/index';

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
