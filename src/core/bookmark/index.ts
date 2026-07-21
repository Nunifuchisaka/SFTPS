import { SECRET_KEYS } from '../profile/index';
import { toPosixPath } from '../transport/path-utils';

export interface Bookmark {
  id: string;
  profileId: string;
  /** 表示名（前後空白は除去して保持）。 */
  name: string;
  /** 正規化済みリモートパス（先頭スラッシュ始まり・末尾スラッシュなし）。 */
  remotePath: string;
}

/** add の入力（remotePath は未正規化でよい）。 */
export type BookmarkInput = Bookmark;

export interface BookmarkStoreOptions {
  initial?: Bookmark[];
}

/** ブックマークのリモートパスを正規化する（重複判定のキーにもなる）。 */
export function normalizeBookmarkPath(remotePath: string): string {
  return toPosixPath(remotePath);
}

function assertNoSecrets(source: Record<string, unknown>): void {
  for (const key of SECRET_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      throw new Error(`secret field "${key}" must not be recorded in bookmarks`);
    }
  }
}

/** Bookmark に許可されたフィールドのみ（ホワイトリスト）へ整形しつつ検証する。 */
function sanitizeInput(input: BookmarkInput): Bookmark {
  assertNoSecrets(input as unknown as Record<string, unknown>);
  const name = String(input.name ?? '').trim();
  if (name === '') throw new Error('bookmark name is required');
  const rawPath = String(input.remotePath ?? '').trim();
  if (rawPath === '') throw new Error('bookmark remotePath is required');
  return {
    id: input.id,
    profileId: input.profileId,
    name,
    remotePath: normalizeBookmarkPath(rawPath),
  };
}

/**
 * よく使うリモートパスを保持する純粋なストア。
 * 同一プロファイル内で正規化後のパスが重複するものは追加しない（別プロファイルの同一パスは可）。
 */
export class BookmarkStore {
  private bookmarks: Bookmark[];

  constructor(options: BookmarkStoreOptions = {}) {
    this.bookmarks = options.initial ? options.initial.map((b) => ({ ...b })) : [];
  }

  /**
   * ブックマークを追加する（追加順を保つ）。
   * 既に同一プロファイル・同一パスのものがあれば追加せず、既存のものを返す。
   */
  add(input: BookmarkInput): Bookmark {
    const clean = sanitizeInput(input);
    const existing = this.bookmarks.find(
      (b) => b.profileId === clean.profileId && b.remotePath === clean.remotePath,
    );
    if (existing) return { ...existing };
    this.bookmarks.push(clean);
    return { ...clean };
  }

  /** id で削除する（存在しなければ何もしない）。 */
  remove(id: string): void {
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id);
  }

  /** 追加順に返す（profileId 指定時はそのプロファイル分のみ）。 */
  list(profileId?: string): Bookmark[] {
    return this.bookmarks
      .filter((b) => profileId === undefined || b.profileId === profileId)
      .map((b) => ({ ...b }));
  }

  /** 表示名を変更する（位置は変えない）。 */
  rename(id: string, name: string): Bookmark {
    const target = this.bookmarks.find((b) => b.id === id);
    if (!target) throw new Error(`bookmark not found: ${id}`);
    const trimmed = String(name ?? '').trim();
    if (trimmed === '') throw new Error('bookmark name is required');
    target.name = trimmed;
    return { ...target };
  }

  toData(): Bookmark[] {
    return this.list();
  }
}

export function serializeBookmarks(store: BookmarkStore): string {
  return JSON.stringify(store.toData(), null, 2);
}

export function parseBookmarks(json: string): Bookmark[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error('bookmarks JSON must be an array');
  return raw.map((item) => sanitizeInput(item as BookmarkInput));
}
