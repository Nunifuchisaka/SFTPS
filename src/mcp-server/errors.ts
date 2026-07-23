import type { HostKeyVerdict } from '../core/hostkey/index';

/**
 * SFTP のホスト鍵検証がフェイルクローズで拒否された接続エラーを、
 * trust_host_key ツールの呼び出しにそのまま使える情報つきで表す。
 * mismatch（鍵変更）の場合は remove_host_key を先に呼ぶ必要がある旨も文面に含める
 * （鍵変更の再信頼は常に2段階の明示操作にする、という既存の設計を MCP 経由でも維持するため）。
 */
export class HostKeyTrustRequiredError extends Error {
  constructor(
    readonly host: string,
    readonly port: number,
    readonly fingerprint: string,
    readonly verdict: HostKeyVerdict,
    readonly knownFingerprint: string | null,
  ) {
    super(HostKeyTrustRequiredError.buildMessage(host, port, fingerprint, verdict, knownFingerprint));
    this.name = 'HostKeyTrustRequiredError';
  }

  private static buildMessage(
    host: string,
    port: number,
    fingerprint: string,
    verdict: HostKeyVerdict,
    knownFingerprint: string | null,
  ): string {
    if (verdict === 'mismatch') {
      return (
        `SFTP host key for ${host}:${port} has changed (possible MITM). ` +
        `known fingerprint: ${knownFingerprint ?? '(none)'}, presented fingerprint: ${fingerprint}. ` +
        `Call remove_host_key({ host: "${host}", port: ${port} }) first, then trust_host_key ` +
        `with the new fingerprint, before retrying.`
      );
    }
    return (
      `SFTP host key for ${host}:${port} is not trusted yet (fingerprint: ${fingerprint}). ` +
      `Call trust_host_key({ host: "${host}", port: ${port}, fingerprint: "${fingerprint}" }), then retry.`
    );
  }
}
