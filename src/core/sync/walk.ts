import type { RemoteTransport } from '../transport/index';
import { posixJoin, toPosixPath } from '../transport/path-utils';
import { hashBuffer } from '../checksum/index';
import { DEFAULT_IGNORE, isIgnored } from './ignore';
import type { SyncEntry } from './types';

export interface WalkOptions {
  /** 除外パターン（既定 DEFAULT_IGNORE）。 */
  ignore?: string[];
  /** 再帰の深さ上限（既定 64）。対称リンク等による無限ループの保険。 */
  maxDepth?: number;
  /** true のとき各ファイルの内容を読んでハッシュを計算する（checksum 比較用・コスト高）。 */
  computeHash?: boolean;
}

/**
 * transport のツリーを base から再帰的に走査し、base 相対の SyncEntry 配列を返す。
 * ディレクトリはその子より前に列挙される（create-dir を upload より先に実行できるように）。
 */
export async function walkTree(
  transport: RemoteTransport,
  base = '/',
  options: WalkOptions = {},
): Promise<SyncEntry[]> {
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const maxDepth = options.maxDepth ?? 64;
  const computeHash = options.computeHash ?? false;
  const baseNorm = toPosixPath(base);
  const result: SyncEntry[] = [];

  async function walk(dirAbs: string, relPrefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await transport.list(dirAbs);
    for (const entry of entries) {
      const rel = relPrefix === '' ? entry.name : `${relPrefix}/${entry.name}`;
      if (isIgnored(rel, ignore)) continue;
      const childAbs = posixJoin(dirAbs, entry.name);
      const syncEntry: SyncEntry = {
        path: rel,
        type: entry.type,
        size: entry.size,
        modifiedAt: entry.modifiedAt,
      };
      if (computeHash && entry.type === 'file') {
        syncEntry.hash = hashBuffer(await transport.readFile(childAbs));
      }
      result.push(syncEntry);
      if (entry.type === 'dir') {
        await walk(childAbs, rel, depth + 1);
      }
    }
  }

  await walk(baseNorm, '', 0);
  return result;
}
