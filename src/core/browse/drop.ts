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
