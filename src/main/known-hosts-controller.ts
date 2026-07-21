import type { HostKeyVerdict, KnownHostEntry, KnownHostsStore } from '../core/hostkey/index';
import type { KnownHostsFile } from './known-hosts-store';

/**
 * known_hosts の参照・更新口。メモリ上のストアとファイル永続化を束ねる。
 * 保存失敗は握り潰さず呼び出し側へ伝える（IPC 経由ならレンダラのステータスに出る）。
 */
export class KnownHostsController {
  constructor(
    private readonly file: KnownHostsFile,
    private readonly store: KnownHostsStore,
  ) {}

  list(): KnownHostEntry[] {
    return this.store.list();
  }

  verify(host: string, port: number, fingerprint: string): HostKeyVerdict {
    return this.store.verify(host, port, fingerprint);
  }

  lookup(host: string, port: number): string | null {
    return this.store.lookup(host, port);
  }

  /** 明示同意された鍵を記録して永続化する。 */
  async trust(host: string, port: number, fingerprint: string): Promise<void> {
    this.store.add(host, port, fingerprint);
    await this.file.save(this.store);
  }

  /** 信頼を取り消して永続化する（正当な鍵更新後に再信頼させるための導線）。 */
  async remove(host: string, port: number): Promise<boolean> {
    if (!this.store.remove(host, port)) return false;
    await this.file.save(this.store);
    return true;
  }
}
