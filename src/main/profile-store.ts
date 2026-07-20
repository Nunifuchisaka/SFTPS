import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseProfiles, serializeProfiles, type Profile } from '../core/profile/index';

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
    } catch {
      return [];
    }
    return parseProfiles(raw);
  }

  async saveAll(profiles: Profile[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, serializeProfiles(profiles), 'utf8');
  }
}
