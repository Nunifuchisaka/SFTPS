import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BookmarkStore, parseBookmarks, serializeBookmarks } from '../core/bookmark/index';

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
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, serializeBookmarks(store), 'utf8');
  }
}
