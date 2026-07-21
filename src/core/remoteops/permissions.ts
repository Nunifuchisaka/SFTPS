import type { Protocol } from '../profile/index';

export type RemoteAction = 'rename' | 'chmod' | 'delete';

/**
 * 8進のパーミッション文字列（"644" / "0755" 等）を数値に変換する純粋関数。
 * 不正な値（8進以外・桁数外）は null を返す。
 */
export function parseMode(input: string): number | null {
  if (!/^[0-7]{3,4}$/.test(input)) return null;
  return parseInt(input, 8);
}

const CAPABILITIES: Record<Protocol, Record<RemoteAction, boolean>> = {
  sftp: { rename: true, chmod: true, delete: true },
  ftp: { rename: true, chmod: false, delete: true },
  // S3 の rename は copy+delete で疑似実装。chmod は ACL 概念で別物のため非対応。
  s3: { rename: true, chmod: false, delete: true },
};

/** プロトコルが指定操作に対応しているかを返す純粋関数（UI/IPC の出し分け用）。 */
export function isActionAvailable(protocol: Protocol, action: RemoteAction): boolean {
  return CAPABILITIES[protocol][action];
}
