import { readFile } from 'node:fs/promises';
import { parseProfiles, serializeProfiles, type Profile } from '../core/profile/index';
import { writeFileAtomic } from './atomic-write';
import { isFileNotFound } from './file-errors';

/**
 * 接続プロファイル（シークレット非保持）を JSON ファイルへ永続化する。
 * 直列化時にシークレットは常に除去される（serializeProfiles に委譲）。
 */
export class ProfileStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<Profile[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (err) {
      if (isFileNotFound(err)) return [];
      throw err;
    }
    return parseProfiles(raw);
  }

  async saveAll(profiles: Profile[]): Promise<void> {
    await writeFileAtomic(this.filePath, serializeProfiles(profiles));
  }
}
