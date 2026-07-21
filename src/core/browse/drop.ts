export interface DroppedItem {
  /** OS 上の絶対パス。 */
  path: string;
  isDirectory: boolean;
}

export interface DropTarget {
  /** ファイルは upload、ディレクトリは sync（フォルダ差分同期）。 */
  kind: 'upload' | 'sync';
  sourcePath: string;
  /** リモート側の配置先 posix パス。 */
  destPath: string;
}

function baseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return trimmed.slice(idx + 1);
}

function joinPosix(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '');
  return d === '' ? `/${name}` : `${d}/${name}`;
}

/**
 * ドロップされたパス群を、判定関数でファイル/ディレクトリに分類する。
 * 個別の判定が失敗したパスはファイル（upload 扱い）に落とし、全体は失敗させない。
 */
export async function classifyDroppedPaths(
  paths: string[],
  isDirectory: (p: string) => Promise<boolean>,
): Promise<DroppedItem[]> {
  return Promise.all(
    paths.map(async (path) => ({
      path,
      isDirectory: await isDirectory(path).catch(() => false),
    })),
  );
}

/**
 * ドロップされた項目群を、配置先ディレクトリ配下の転送対象へ解決する純粋関数。
 * ファイルは upload、ディレクトリは sync として扱う。
 */
export function resolveDropTargets(items: DroppedItem[], destDir: string): DropTarget[] {
  return items.map((item) => ({
    kind: item.isDirectory ? 'sync' : 'upload',
    sourcePath: item.path,
    destPath: joinPosix(destDir, baseName(item.path)),
  }));
}
