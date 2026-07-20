import type { RemoteEntry } from '../transport/index';

export interface FilterOptions {
  /** ドット始まりの隠しファイルを表示するか（既定 false）。 */
  showHidden?: boolean;
}

/**
 * 一覧を絞り込む純粋関数。名前の部分一致（大小無視）で判定し、
 * ディレクトリを常にファイルより前に並べる。
 */
export function filterEntries(
  entries: RemoteEntry[],
  query: string,
  options: FilterOptions = {},
): RemoteEntry[] {
  const q = query.trim().toLowerCase();
  const showHidden = options.showHidden ?? false;

  const filtered = entries.filter((entry) => {
    if (!showHidden && entry.name.startsWith('.')) return false;
    if (q === '') return true;
    return entry.name.toLowerCase().includes(q);
  });

  const dirs = filtered.filter((e) => e.type === 'dir');
  const files = filtered.filter((e) => e.type === 'file');
  return [...dirs, ...files];
}
