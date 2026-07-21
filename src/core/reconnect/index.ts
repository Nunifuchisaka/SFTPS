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

/** ssh2 のホスト鍵拒否（`Host denied (verification failed)` 等）。 */
const HOSTKEY_PATTERN = /host denied|host key|hostkey|verification failed|known[_ ]hosts/i;

/** TLS 証明書検証の失敗。 */
const TLS_PATTERN =
  /certificate|self[- ]signed|cert[_ ]chain|unable to verify the first cert|hostname\/ip does not match/i;

const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** 接続エラーの種別。security 系（hostkey/tls）は再試行せず専用の警告として扱う。 */
export type ConnectionErrorKind = 'auth' | 'hostkey' | 'tls' | 'retryable';

/**
 * 接続エラーを種別に分類する純粋関数。
 * ホスト鍵検証失敗・証明書検証失敗は MITM の可能性があるため、
 * 認証失敗と同様に（むしろそれ以上に）再試行してはならない種別として切り出す。
 */
export function classifyConnectionError(error: unknown): ConnectionErrorKind {
  const e = error as { code?: unknown; message?: unknown };
  const message = String(e?.message ?? error ?? '');
  const code = typeof e?.code === 'string' ? e.code : '';

  if (HOSTKEY_PATTERN.test(message)) return 'hostkey';
  if (TLS_CODES.has(code) || TLS_PATTERN.test(message)) return 'tls';
  if (RETRYABLE_CODES.has(code)) return 'retryable'; // ソケット層の事実はメッセージ推測より優先
  if (AUTH_PATTERN.test(message)) return 'auth';
  // 上記以外の接続エラーは一過性の可能性があるため再試行対象とする。
  return 'retryable';
}

/** 種別に対応する警告文言のキー。通常の再試行対象エラーには専用文言を持たない。 */
export function connectionErrorMessageKey(kind: ConnectionErrorKind): string | null {
  switch (kind) {
    case 'hostkey':
      return 'conn.error.hostkey';
    case 'tls':
      return 'conn.error.tls';
    case 'auth':
      return 'conn.error.auth';
    case 'retryable':
      return null;
  }
}

/**
 * 接続エラーが再接続で回復し得る種別か判定する純粋関数。
 * 認証失敗・ホスト鍵検証失敗・証明書検証失敗は false（ネットワーク断/タイムアウト等は true）。
 */
export function isRetryableConnectionError(error: unknown): boolean {
  return classifyConnectionError(error) === 'retryable';
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
