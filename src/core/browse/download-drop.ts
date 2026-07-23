export interface DragEntry {
  /** ドラッグ元（リモート）の絶対パス。 */
  path: string;
  type: 'file' | 'dir';
}

export interface DownloadDropTarget {
  /** ファイルは download、ディレクトリは download-sync（フォルダ再帰ダウンロード）。 */
  kind: 'download' | 'download-sync';
  sourcePath: string;
  /** ローカル側の配置先パス。 */
  destPath: string;
}

function baseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return trimmed.slice(idx + 1);
}

function joinLocal(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`;
}

/**
 * ドラッグされたリモート項目群を、ローカル配置先ディレクトリ配下の
 * ダウンロード対象へ解決する純粋関数。
 * ファイルは download、ディレクトリは download-sync として扱う。
 */
export function resolveDownloadTargets(
  entries: DragEntry[],
  destLocalDir: string,
): DownloadDropTarget[] {
  return entries.map((entry) => ({
    kind: entry.type === 'dir' ? 'download-sync' : 'download',
    sourcePath: entry.path,
    destPath: joinLocal(destLocalDir, baseName(entry.path)),
  }));
}
