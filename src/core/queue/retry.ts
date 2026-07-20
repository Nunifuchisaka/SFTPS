export interface RetryOptions {
  /** 最大試行回数（初回を含む）。 */
  maxAttempts: number;
  /** 初回リトライの基準待機（ミリ秒）。 */
  baseDelayMs: number;
  /** 指数バックオフの倍率。 */
  factor: number;
  /** 待機の上限（ミリ秒）。 */
  maxDelayMs: number;
}

/**
 * 指数バックオフの次回待機時間を返す純粋関数。
 * @param attempt これまでに失敗した試行回数（1 = 初回が失敗）。
 * @returns 次回リトライまでの待機ミリ秒。もう再試行しないなら null。
 */
export function nextRetryDelay(attempt: number, options: RetryOptions): number | null {
  if (attempt >= options.maxAttempts) return null;
  const raw = options.baseDelayMs * Math.pow(options.factor, attempt - 1);
  return Math.min(raw, options.maxDelayMs);
}
