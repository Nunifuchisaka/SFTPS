import { nextRetryDelay, type RetryOptions } from '../queue/retry';

/** 再接続のバックオフ設定（M1 の RetryOptions と同形＝バックオフ計算を共有）。 */
export type ReconnectOptions = RetryOptions;

const RETRYABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

const AUTH_PATTERN = /auth|permission denied|access denied|credential|unauthor|invalid password|login failed|publickey/i;

/**
 * 接続エラーが再接続で回復し得る種別か判定する純粋関数。
 * 認証失敗など再試行が無意味なものは false（ネットワーク断/タイムアウト等は true）。
 */
export function isRetryableConnectionError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown };
  const message = String(e?.message ?? error ?? '');
  if (AUTH_PATTERN.test(message)) return false;
  const code = typeof e?.code === 'string' ? e.code : '';
  if (RETRYABLE_CODES.has(code)) return true;
  // 認証以外の接続エラーは一過性の可能性があるため再試行対象とする。
  return true;
}

export interface ReconnectDecision {
  retry: boolean;
  delayMs: number;
}

/** エラーと試行回数から、再接続の可否と待機時間を決める純粋関数。 */
export function shouldReconnect(
  error: unknown,
  attempt: number,
  options: ReconnectOptions,
): ReconnectDecision {
  if (!isRetryableConnectionError(error)) return { retry: false, delayMs: 0 };
  const delay = nextRetryDelay(attempt, options);
  if (delay === null) return { retry: false, delayMs: 0 };
  return { retry: true, delayMs: delay };
}

function realDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * connect を試み、再接続すべきエラーなら指数バックオフで再試行して接続を確立する。
 * 認証失敗など回復不能なエラー、または maxAttempts 到達時は最後のエラーを rethrow する。
 */
export async function establishConnection(
  connect: () => Promise<void>,
  options: ReconnectOptions,
  delay: (ms: number) => Promise<void> = realDelay,
): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      await connect();
      return;
    } catch (err) {
      attempt++;
      const decision = shouldReconnect(err, attempt, options);
      if (!decision.retry) throw err;
      await delay(decision.delayMs);
    }
  }
}
