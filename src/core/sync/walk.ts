import type { RemoteTransport } from '../transport/index';
import { posixJoin, toPosixPath } from '../transport/path-utils';
import { DEFAULT_IGNORE, isIgnored } from './ignore';
import type { SyncEntry } from './types';

export interface WalkOptions {
  /** 除外パターン（既定 DEFAULT_IGNORE）。 */
  ignore?: string[];
  /** 再帰の深さ上限（既定 64）。対称リンク等による無限ループの保険。 */
  maxDepth?: number;
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
  const baseNorm = toPosixPath(base);
  const result: SyncEntry[] = [];

  async function walk(dirAbs: string, relPrefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await transport.list(dirAbs);
    for (const entry of entries) {
      const rel = relPrefix === '' ? entry.name : `${relPrefix}/${entry.name}`;
      if (isIgnored(rel, ignore)) continue;
      result.push({ path: rel, type: entry.type, size: entry.size, modifiedAt: entry.modifiedAt });
      if (entry.type === 'dir') {
        await walk(posixJoin(dirAbs, entry.name), rel, depth + 1);
      }
    }
  }

  await walk(baseNorm, '', 0);
  return result;
}
