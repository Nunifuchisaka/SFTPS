import { createHash } from 'node:crypto';

export type HashAlgorithm = 'sha256' | 'sha1' | 'md5' | 'sha512';

/** バッファのハッシュ（16進ダイジェスト）を計算する純粋関数。 */
export function hashBuffer(buf: Buffer, algo: HashAlgorithm = 'sha256'): string {
  return createHash(algo).update(buf).digest('hex');
}

/** 2つのハッシュ文字列が一致するか検証する純粋関数。 */
export function verifyIntegrity(sourceHash: string, destHash: string): { ok: boolean } {
  return { ok: sourceHash === destHash };
}

/** 2つのバッファの内容がハッシュ一致するか検証する純粋関数。 */
export function verifyBuffers(a: Buffer, b: Buffer, algo: HashAlgorithm = 'sha256'): { ok: boolean } {
  return verifyIntegrity(hashBuffer(a, algo), hashBuffer(b, algo));
}
