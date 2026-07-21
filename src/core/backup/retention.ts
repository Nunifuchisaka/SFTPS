/** バックアップの保持ポリシー。 */
export interface BackupRetention {
  /** 保持する世代数の上限。 */
  maxGenerations: number;
  /** 保持期間（日数）。null なら無期限。 */
  maxAgeDays: number | null;
}

/** 既定の保持ポリシー（従来の「世代20・期間無制限」と同じ挙動）。 */
export const DEFAULT_BACKUP_RETENTION: BackupRetention = {
  maxGenerations: 20,
  maxAgeDays: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupRetentionPlan<T> {
  /** 残す世代（新しい順）。 */
  keep: T[];
  /** 削除する世代（新しい順）。 */
  remove: T[];
}

/**
 * 保持ポリシーから、残す世代と削除する世代を決める純粋関数（時刻は注入）。
 * まず保持期間を超過したものを落とし、残りに世代数の上限を適用する。
 * 期限超過は最新世代であっても削除対象になる（資格情報入りファイルを残さないため）。
 */
export function planBackupRetention<T extends { timestamp: Date }>(
  generations: readonly T[],
  retention: BackupRetention,
  now: Date,
): BackupRetentionPlan<T> {
  const sorted = [...generations].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const limit = Math.max(0, retention.maxGenerations);
  const oldest =
    retention.maxAgeDays === null ? null : now.getTime() - retention.maxAgeDays * DAY_MS;

  const keep: T[] = [];
  const remove: T[] = [];
  for (const generation of sorted) {
    const expired = oldest !== null && generation.timestamp.getTime() < oldest;
    if (!expired && keep.length < limit) keep.push(generation);
    else remove.push(generation);
  }
  return { keep, remove };
}
