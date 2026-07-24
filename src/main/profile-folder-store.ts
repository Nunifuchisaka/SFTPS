import { readFile } from 'node:fs/promises';
import {
  parseProfileFolders,
  serializeProfileFolders,
  type ProfileFolder,
} from '../core/profile-folder/index';
import { writeFileAtomic } from './atomic-write';

/** プロファイルのフォルダ分けを JSON ファイルへ永続化する。 */
export class ProfileFolderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ProfileFolder[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return [];
    }
    return parseProfileFolders(raw);
  }

  async saveAll(folders: ProfileFolder[]): Promise<void> {
    await writeFileAtomic(this.filePath, serializeProfileFolders(folders));
  }
}
