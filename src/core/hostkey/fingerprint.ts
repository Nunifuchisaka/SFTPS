import { createHash } from 'node:crypto';

/**
 * ホスト公開鍵の blob（ワイヤ形式のバイト列）から OpenSSH 形式の
 * SHA256 フィンガープリント `SHA256:<base64 padding除去>` を生成する。
 */
export function sha256Fingerprint(keyBlob: Buffer): string {
  const digest = createHash('sha256').update(keyBlob).digest('base64');
  return `SHA256:${digest.replace(/=+$/, '')}`;
}
