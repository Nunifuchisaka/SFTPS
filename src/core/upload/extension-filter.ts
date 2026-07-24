/** アップロード時に許可する拡張子のフィルタ設定。 */
export interface ExtensionFilter {
  enabled: boolean;
  /** 正規化済み拡張子リスト（小文字・先頭ドットなし）。 */
  extensions: string[];
}

const MAX_EXTENSIONS = 50;
const MAX_EXTENSION_LENGTH = 20;

/** 入力の拡張子文字列を、比較に使える形へ丸める（小文字化・先頭ドット/空白除去）。 */
function normalizeExtension(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\.+/, '');
}

/**
 * 任意の文字列配列を、安全な拡張子リストへ正規化する純粋関数。
 * 空文字・不正な形式・重複は除外し、件数は上限でクランプする（フェイルセーフ）。
 */
export function normalizeExtensionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const ext = normalizeExtension(item).slice(0, MAX_EXTENSION_LENGTH);
    if (ext === '' || !/^[a-z0-9_-]+$/.test(ext)) continue;
    seen.add(ext);
    if (seen.size >= MAX_EXTENSIONS) break;
  }
  return [...seen];
}

/** ファイル名の拡張子を小文字で返す（拡張子がなければ空文字）。 */
export function extensionOf(fileName: string): string {
  const base = fileName.replace(/[\\/]+$/, '');
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return '';
  return base.slice(idx + 1).toLowerCase();
}

/** extensions が空なら常に許可（無制限）、そうでなければ拡張子一致で判定する。 */
export function hasAllowedExtension(fileName: string, extensions: string[]): boolean {
  if (extensions.length === 0) return true;
  return extensions.includes(extensionOf(fileName));
}

/** フィルタが無効なら常に許可、有効なら hasAllowedExtension に委譲する。 */
export function isUploadAllowed(fileName: string, filter: ExtensionFilter): boolean {
  if (!filter.enabled) return true;
  return hasAllowedExtension(fileName, filter.extensions);
}
