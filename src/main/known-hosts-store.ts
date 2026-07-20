import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { KnownHostsStore, parseKnownHosts, serializeKnownHosts } from '../core/hostkey/index';

/**
 * known_hosts（信頼済みホスト鍵フィンガープリント）を JSON ファイルへ薄く永続化する。
 * 判定ロジックは core/hostkey の純粋関数に委ねる。
 */
export class KnownHostsFile {
  constructor(private readonly filePath: string) {}

  async load(): Promise<KnownHostsStore> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return parseKnownHosts(raw);
    } catch {
      return new KnownHostsStore();
    }
  }

  async save(store: KnownHostsStore): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, serializeKnownHosts(store), 'utf8');
  }
}
