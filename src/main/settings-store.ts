import { readFile } from 'node:fs/promises';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseSettings,
  serializeSettings,
  type AppSettings,
} from '../core/settings/index';
import { writeFileAtomic } from './atomic-write';

/** アプリ設定を JSON ファイルへ薄く永続化する。検証/正規化は core/settings に委ねる。 */
export class SettingsFile {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    try {
      return parseSettings(await readFile(this.filePath, 'utf8'));
    } catch {
      // 未作成・読めない場合は既定で開始する（機微情報を含まないため停止はしない）。
      return normalizeSettings(DEFAULT_SETTINGS);
    }
  }

  /** 正規化してから保存し、実際に保存された値を返す。 */
  async save(settings: unknown): Promise<AppSettings> {
    const normalized = normalizeSettings(settings);
    await writeFileAtomic(this.filePath, serializeSettings(normalized));
    return normalized;
  }
}
