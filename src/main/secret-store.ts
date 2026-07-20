import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
    return JSON.parse(decrypted) as Record<string, string>;
  }

  async deleteSecrets(profileId: string): Promise<void> {
    const all = await this.readAll();
    if (!(profileId in all)) return;
    delete all[profileId];
    await this.writeAll(all);
  }

  private async readAll(): Promise<SecretFile> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as SecretFile;
    } catch {
      return {};
    }
  }

  private async writeAll(data: SecretFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
