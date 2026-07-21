import type { HostKeyVerdict } from './known-hosts';

/** ホスト鍵ポリシー。tofu=初回に指紋を提示して同意を取る / strict=既知の鍵のみ受理。 */
export type HostKeyPolicy = 'tofu' | 'strict';

/** ssh2 の hostVerifier に渡す関数の形（callback は非同期に呼んでよい）。 */
export type HostVerifierFn = (key: Buffer, callback: (accepted: boolean) => void) => void;

/** 判定の帰結。accept=即受理 / reject=即拒否 / prompt=指紋を提示して同意を取る。 */
export type HostKeyOutcome = 'accept' | 'reject' | 'prompt';

/** 判定理由。UI に出す文言の選択に使う。 */
export type HostKeyReason = 'trusted' | 'unknown' | 'mismatch' | 'policy';

export interface HostKeyPlan {
  outcome: HostKeyOutcome;
  /** prompt に同意された場合に known_hosts へ記録するか。 */
  recordOnConsent: boolean;
  reason: HostKeyReason;
}

export interface HostKeyAction {
  /** 接続を受理するか。 */
  accept: boolean;
  /** 新規鍵として known_hosts に記録するか。 */
  record: boolean;
}

/**
 * 検証結果とポリシーから、受理/拒否/確認要求を決める純粋関数。
 * - trusted: 受理（記録不要）
 * - mismatch: 常に拒否（鍵変更＝MITM の疑い。再信頼は known_hosts 管理UI からのみ）
 * - unknown: TOFU なら指紋を提示して同意を取る（無言受理はしない）、strict なら拒否
 */
export function planHostKeyAction(verdict: HostKeyVerdict, policy: HostKeyPolicy): HostKeyPlan {
  if (verdict === 'trusted') return { outcome: 'accept', recordOnConsent: false, reason: 'trusted' };
  if (verdict === 'mismatch') {
    return { outcome: 'reject', recordOnConsent: false, reason: 'mismatch' };
  }
  return policy === 'tofu'
    ? { outcome: 'prompt', recordOnConsent: true, reason: 'unknown' }
    : { outcome: 'reject', recordOnConsent: false, reason: 'policy' };
}

/** 判定と（prompt の場合の）ユーザー同意から、最終的な受理/記録を決める純粋関数。 */
export function resolveHostKeyAction(plan: HostKeyPlan, consented: boolean): HostKeyAction {
  if (plan.outcome === 'accept') return { accept: true, record: false };
  if (plan.outcome === 'reject') return { accept: false, record: false };
  return consented ? { accept: true, record: plan.recordOnConsent } : { accept: false, record: false };
}

/** ユーザーへの提示に必要な情報。 */
export interface HostKeyPromptRequest {
  host: string;
  port: number;
  /** 今回サーバーが提示した鍵の SHA256 指紋。 */
  fingerprint: string;
  verdict: HostKeyVerdict;
  /** 既に記録済みの指紋（mismatch の比較提示用）。無ければ null。 */
  knownFingerprint: string | null;
}

/** ダイアログ表示に必要な内容（Electron の showMessageBox 引数と同形）。 */
export interface HostKeyPromptContent {
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  /** 「信頼して接続」に対応するボタン index。同意を提供しない場合は -1。 */
  acceptId: number;
  defaultId: number;
  cancelId: number;
}

export type PromptTranslator = (key: string, params?: Record<string, string | number>) => string;

/**
 * 提示内容を組み立てる純粋関数。
 * 既定ボタンは常に拒否側にする（誤 Enter で信頼させない）。
 */
export function buildHostKeyPrompt(
  request: HostKeyPromptRequest,
  t: PromptTranslator,
): HostKeyPromptContent {
  const params = { host: request.host, port: request.port };
  if (request.verdict === 'mismatch') {
    return {
      title: t('hostkey.prompt.title'),
      message: t('hostkey.prompt.mismatch.message', params),
      detail: t('hostkey.prompt.mismatch.detail', {
        knownFingerprint: request.knownFingerprint ?? '',
        fingerprint: request.fingerprint,
      }),
      buttons: [t('hostkey.prompt.close')],
      acceptId: -1,
      defaultId: 0,
      cancelId: 0,
    };
  }
  return {
    title: t('hostkey.prompt.title'),
    message: t('hostkey.prompt.unknown.message', params),
    detail: t('hostkey.prompt.unknown.detail', { fingerprint: request.fingerprint }),
    buttons: [t('hostkey.prompt.reject'), t('hostkey.prompt.accept')],
    acceptId: 1,
    defaultId: 0,
    cancelId: 0,
  };
}

/** ダイアログの応答 index が「信頼する」を意味するか判定する純粋関数。 */
export function isPromptConsent(content: HostKeyPromptContent, response: number): boolean {
  return content.acceptId >= 0 && response === content.acceptId;
}

export interface HostVerifierContext {
  host: string;
  port: number;
  policy: HostKeyPolicy;
  /** 鍵 blob からフィンガープリントを算出する（通常 sha256Fingerprint）。 */
  fingerprintOf: (key: Buffer) => string;
  /** host/port/fingerprint から検証結果を返す（通常 KnownHostsStore.verify）。 */
  verify: (host: string, port: number, fingerprint: string) => HostKeyVerdict;
  /** 記録済み指紋を引く（mismatch の比較提示用）。 */
  knownFingerprintOf?: (host: string, port: number) => string | null;
  /** 指紋を提示して同意を得る。未指定なら同意なしとみなす（フェイルクローズ）。 */
  confirm?: (request: HostKeyPromptRequest) => Promise<boolean>;
  /** 新規鍵を受理した際に呼ばれる副作用（記録・永続化）。 */
  onAccept: (host: string, port: number, fingerprint: string) => void;
  /** 拒否した際の通知（MITM 警告の表示など）。 */
  onReject?: (request: HostKeyPromptRequest) => void;
}

/**
 * ssh2 の hostVerifier コールバックを組み立てる。
 * 判定は planHostKeyAction / resolveHostKeyAction（純粋）に委譲し、
 * 未知の鍵は confirm（注入）でユーザーの明示同意を得るまで受理しない。
 */
export function createHostVerifier(ctx: HostVerifierContext): HostVerifierFn {
  return (key, callback) => {
    void (async () => {
      const fingerprint = ctx.fingerprintOf(key);
      const verdict = ctx.verify(ctx.host, ctx.port, fingerprint);
      const plan = planHostKeyAction(verdict, ctx.policy);
      const request: HostKeyPromptRequest = {
        host: ctx.host,
        port: ctx.port,
        fingerprint,
        verdict,
        knownFingerprint: ctx.knownFingerprintOf?.(ctx.host, ctx.port) ?? null,
      };

      let consented = false;
      if (plan.outcome === 'prompt') {
        try {
          consented = ctx.confirm ? await ctx.confirm(request) : false;
        } catch {
          consented = false; // ダイアログが出せない場合も受理しない
        }
      }

      const action = resolveHostKeyAction(plan, consented);
      if (action.record) ctx.onAccept(ctx.host, ctx.port, fingerprint);
      if (!action.accept) ctx.onReject?.(request);
      callback(action.accept);
    })();
  };
}
