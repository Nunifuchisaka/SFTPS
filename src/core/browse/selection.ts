/** 選択集合を操作する純粋関数群。いずれも入力を変更せず新しい Set を返す。 */

export function toggleSelection(selection: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selection);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

export function selectAll(paths: Iterable<string>): Set<string> {
  return new Set(paths);
}

export function clearSelection(): Set<string> {
  return new Set();
}

/** anchor から target までの連続範囲を選択する（shift クリック相当）。端点が無ければ空。 */
export function selectRange(orderedPaths: string[], anchor: string, target: string): Set<string> {
  const i = orderedPaths.indexOf(anchor);
  const j = orderedPaths.indexOf(target);
  if (i === -1 || j === -1) return new Set();
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return new Set(orderedPaths.slice(lo, hi + 1));
}

/** 現存しないパスの選択を掃除する（フィルタ変更後などに使う）。 */
export function pruneSelection(selection: ReadonlySet<string>, validPaths: Iterable<string>): Set<string> {
  const valid = new Set(validPaths);
  return new Set([...selection].filter((p) => valid.has(p)));
}
