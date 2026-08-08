import { readFile } from 'node:fs/promises';
import { KnownHostsStore, parseKnownHosts, serializeKnownHosts } from '../core/hostkey/index';
import { writeFileAtomic } from './atomic-write';
import { isFileNotFound } from './file-errors';

/**
 * known_hosts の読み込みに失敗したことを表す。
 * 「信頼済みゼロ」として正常扱いすると、ピン留めが実質バイパスされるため、
 * 破損・権限エラーは必ずこの例外で呼び出し側に伝える（フェイルクローズ）。
 */
export class KnownHostsLoadError extends Error {
  constructor(
    readonly filePath: string,
    override readonly cause: unknown,
  ) {
    super(`failed to load known_hosts: ${filePath}`);
    this.name = 'KnownHostsLoadError';
  }
}

/**
 * known_hosts（信頼済みホスト鍵フィンガープリント）を JSON ファイルへ薄く永続化する。
 * 判定ロジックは core/hostkey の純粋関数に委ねる。
 */
export class KnownHostsFile {
  constructor(private readonly filePath: string) {}

  /**
   * 初回起動（ENOENT）のみ空ストアで開始する。
   * それ以外の失敗（JSON 破損・権限エラー・部分書き込み）は握り潰さず例外にする。
   */
  async load(): Promise<KnownHostsStore> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (err) {
      if (isFileNotFound(err)) return new KnownHostsStore();
      throw new KnownHostsLoadError(this.filePath, err);
    }
    try {
      return parseKnownHosts(raw);
    } catch (err) {
      throw new KnownHostsLoadError(this.filePath, err);
    }
  }

  async save(store: KnownHostsStore): Promise<void> {
    await writeFileAtomic(this.filePath, serializeKnownHosts(store));
  }
}
