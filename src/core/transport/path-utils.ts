/** リモートパスを posix 形式（先頭スラッシュ始まり・末尾スラッシュなし）に正規化する。 */
export function toPosixPath(p: string): string {
  let s = p.replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/+/g, '/');
  if (s.length > 1) s = s.replace(/\/$/, '');
  return s;
}

/** 正規化済み posix ディレクトリとベース名を連結する。 */
export function posixJoin(dir: string, name: string): string {
  const d = toPosixPath(dir);
  return d === '/' ? `/${name}` : `${d}/${name}`;
}

/** posix パスの親ディレクトリを返す。 */
export function posixDirname(p: string): string {
  const norm = toPosixPath(p);
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '/' : norm.slice(0, idx);
}

/** posix パスのベース名を返す。 */
export function posixBasename(p: string): string {
  const norm = toPosixPath(p);
  return norm.slice(norm.lastIndexOf('/') + 1);
}
