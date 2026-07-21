export interface RestoreConfirm {
  requiresConfirm: boolean;
  message: string;
}

/** 復元確認に提示する世代情報（BackupInfo の構造的サブセット）。 */
export interface RestoreTarget {
  timestamp: Date;
  size: number;
}

/**
 * バックアップ復元の実行前確認メッセージを組み立てる純粋ガード関数。
 * 復元は現行リモートの上書きであるため、世代日時とサイズを提示して常に確認を求める。
 */
export function confirmRestore(remotePath: string, target: RestoreTarget): RestoreConfirm {
  return {
    requiresConfirm: true,
    message:
      `「${remotePath}」を ${target.timestamp.toLocaleString()} の世代（${target.size} バイト）へ戻します。\n` +
      '現在のリモート内容は復元前にバックアップしますが、リモート上は上書きされます。実行してよろしいですか？',
  };
}
