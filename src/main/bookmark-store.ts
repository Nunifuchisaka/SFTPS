import { readFile } from 'node:fs/promises';
import { BookmarkStore, parseBookmarks, serializeBookmarks } from '../core/bookmark/index';
import { writeFileAtomic } from './atomic-write';

/** ブックマークを JSON ファイルへ薄く永続化する。判定/整形は core/bookmark に委ねる。 */
export class BookmarkFile {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BookmarkStore> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return new BookmarkStore({ initial: parseBookmarks(raw) });
    } catch {
      return new BookmarkStore();
    }
  }

  async save(store: BookmarkStore): Promise<void> {
    await writeFileAtomic(this.filePath, serializeBookmarks(store));
  }
}
