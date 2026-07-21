import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RemoteEntry } from '../core/transport/index';

/** ローカルディレクトリの一覧を RemoteEntry と同じ形で返す（ローカルブラウザ用）。 */
export async function listLocalDir(dir: string): Promise<RemoteEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const entries: RemoteEntry[] = [];
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    try {
      const st = await stat(full);
      entries.push({
        name: d.name,
        path: full,
        type: d.isDirectory() ? 'dir' : 'file',
        size: st.size,
        modifiedAt: st.mtime,
      });
    } catch {
      // アクセスできないエントリはスキップする。
    }
  }
  return entries;
}

/** パスがディレクトリなら true。stat できない（不存在・アクセス不可）場合は false。 */
export async function isLocalDirectory(p: string): Promise<boolean> {
  try {
    const st = await stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}
