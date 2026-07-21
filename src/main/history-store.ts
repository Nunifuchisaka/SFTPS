import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HistoryStore, parseHistory, serializeHistory } from '../core/history/index';

/** 転送履歴を JSON ファイルへ薄く永続化する。判定/整形は core/history に委ねる。 */
export class HistoryFile {
  constructor(private readonly filePath: string) {}

  async load(maxEntries?: number): Promise<HistoryStore> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return new HistoryStore({ initial: parseHistory(raw), maxEntries });
    } catch {
      return new HistoryStore({ maxEntries });
    }
  }

  async save(store: HistoryStore): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, serializeHistory(store), 'utf8');
  }
}
