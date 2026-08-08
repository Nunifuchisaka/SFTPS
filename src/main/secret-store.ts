import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from './atomic-write';
import { assertStringRecord, isFileNotFound } from './file-errors';

/** Electron の safeStorage のうち SecretStore が利用する API のみを表す構造型。 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** OS の暗号化（Keychain/DPAPI）が利用できない環境で保存を試みたときに投げる。 */
export class SecretEncryptionUnavailableError extends Error {
  constructor() {
    super('OS secret encryption (safeStorage) is not available on this platform');
    this.name = 'SecretEncryptionUnavailableError';
  }
}

export interface SecretStoreOptions {
  safeStorage: SafeStorageLike;
  /** 暗号化 blob を保存するファイルの絶対パス（通常 app.getPath('userData') 配下）。 */
  filePath: string;
}

type SecretFile = Record<string, string>;

/**
 * プロファイルのシークレット（パスワード・秘密鍵・AWS シークレット等）を
 * Electron safeStorage で暗号化し、userData 配下のファイルに保存する。
 * 暗号化されていない平文は決して永続化しない。
 */
export class SecretStore {
  private readonly safeStorage: SafeStorageLike;
  private readonly filePath: string;

  constructor(options: SecretStoreOptions) {
    this.safeStorage = options.safeStorage;
    this.filePath = options.filePath;
  }

  isAvailable(): boolean {
    return this.safeStorage.isEncryptionAvailable();
  }

  /**
   * プロファイルのシークレットレコードを **全置換** する低レベル操作。
   * ここに渡さなかった項目は失われるため、フォーム保存など部分更新の経路では
   * 呼び出し側で `mergeSecrets`（core/profile）により既存値とマージしてから渡すこと。
   */
  async setSecrets(profileId: string, secrets: Record<string, string>): Promise<void> {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new SecretEncryptionUnavailableError();
    }
    const encrypted = this.safeStorage.encryptString(JSON.stringify(secrets));
    const all = await this.readAll();
    all[profileId] = encrypted.toString('base64');
    await this.writeAll(all);
  }

  async getSecrets(profileId: string): Promise<Record<string, string> | null> {
    const all = await this.readAll();
    const blob = all[profileId];
    if (blob === undefined) return null;
    const decrypted = this.safeStorage.decryptString(Buffer.from(blob, 'base64'));
    return assertStringRecord(JSON.parse(decrypted) as unknown, `secrets for ${profileId}`);
  }

  async deleteSecrets(profileId: string): Promise<void> {
    const all = await this.readAll();
    if (!(profileId in all)) return;
    delete all[profileId];
    await this.writeAll(all);
  }

  private async readAll(): Promise<SecretFile> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (err) {
      if (isFileNotFound(err)) return {};
      throw err;
    }
    return assertStringRecord(JSON.parse(raw) as unknown, 'secrets file');
  }

  private async writeAll(data: SecretFile): Promise<void> {
    await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2));
  }
}
