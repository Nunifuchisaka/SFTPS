import type { RemoteEntry } from '../transport/index';

export type SortKey = 'name' | 'size' | 'modified';
export type SortDir = 'asc' | 'desc';

/**
 * 一覧を並べ替える純粋関数。ディレクトリを常にファイルより前に置き、
 * 各グループ内を key（名前/サイズ/更新日時）と dir（昇降）で並べ替える。
 */
export function sortEntries(entries: RemoteEntry[], key: SortKey, dir: SortDir = 'asc'): RemoteEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  const compare = (a: RemoteEntry, b: RemoteEntry): number => {
    let r = 0;
    if (key === 'name') {
      r = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    } else if (key === 'size') {
      r = a.size - b.size;
    } else {
      r = (a.modifiedAt?.getTime() ?? 0) - (b.modifiedAt?.getTime() ?? 0);
    }
    return r * sign;
  };

  const dirs = entries.filter((e) => e.type === 'dir').sort(compare);
  const files = entries.filter((e) => e.type === 'file').sort(compare);
  return [...dirs, ...files];
}
