import type { HostKeyVerdict } from './known-hosts';

/** ホスト鍵ポリシー。tofu=初回信頼して記録 / strict=既知の鍵のみ受理。 */
export type HostKeyPolicy = 'tofu' | 'strict';

/** ssh2 の hostVerifier に渡す関数の形。 */
export type HostVerifierFn = (key: Buffer, callback: (accepted: boolean) => void) => void;

export interface HostKeyAction {
  /** 接続を受理するか。 */
  accept: boolean;
  /** 新規鍵として known_hosts に記録するか。 */
  record: boolean;
}

/**
 * 検証結果とポリシーから、受理/記録の判断を返す純粋関数。
 * - trusted: 受理（記録不要）
 * - mismatch: 常に拒否（鍵変更＝MITM の疑い）
 * - unknown: TOFU なら受理して記録、strict なら拒否
 */
export function decideHostKeyAction(verdict: HostKeyVerdict, policy: HostKeyPolicy): HostKeyAction {
  if (verdict === 'trusted') return { accept: true, record: false };
  if (verdict === 'mismatch') return { accept: false, record: false };
  // unknown
  return policy === 'tofu' ? { accept: true, record: true } : { accept: false, record: false };
}

export interface HostVerifierContext {
  host: string;
  port: number;
  policy: HostKeyPolicy;
  /** 鍵 blob からフィンガープリントを算出する（通常 sha256Fingerprint）。 */
  fingerprintOf: (key: Buffer) => string;
  /** host/port/fingerprint から検証結果を返す（通常 KnownHostsStore.verify）。 */
  verify: (host: string, port: number, fingerprint: string) => HostKeyVerdict;
  /** 新規鍵を受理した際に呼ばれる副作用（記録・永続化）。 */
  onAccept: (host: string, port: number, fingerprint: string) => void;
}

/**
 * ssh2 の hostVerifier コールバックを組み立てる。
 * 判定は decideHostKeyAction（純粋）に委譲し、記録は onAccept（注入）で行う。
 */
export function createHostVerifier(ctx: HostVerifierContext): HostVerifierFn {
  return (key, callback) => {
    const fingerprint = ctx.fingerprintOf(key);
    const verdict = ctx.verify(ctx.host, ctx.port, fingerprint);
    const action = decideHostKeyAction(verdict, ctx.policy);
    if (action.record) {
      ctx.onAccept(ctx.host, ctx.port, fingerprint);
    }
    callback(action.accept);
  };
}
