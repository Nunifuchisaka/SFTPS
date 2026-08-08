import { readFile } from 'node:fs/promises';
import { HistoryStore, parseHistory, serializeHistory } from '../core/history/index';
import { writeFileAtomic } from './atomic-write';
import { isFileNotFound } from './file-errors';

/** 転送履歴を JSON ファイルへ薄く永続化する。判定/整形は core/history に委ねる。 */
export class HistoryFile {
  constructor(private readonly filePath: string) {}

  async load(maxEntries?: number): Promise<HistoryStore> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return new HistoryStore({ initial: parseHistory(raw), maxEntries });
    } catch (err) {
      if (isFileNotFound(err)) return new HistoryStore({ maxEntries });
      throw err;
    }
  }

  async save(store: HistoryStore): Promise<void> {
    await writeFileAtomic(this.filePath, serializeHistory(store));
  }
}
