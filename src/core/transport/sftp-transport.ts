import type { RemoteEntry, RemoteTransport } from './types';
import { posixJoin } from './path-utils';

/** ssh2-sftp-client の list 結果のうちアダプタが参照する部分。 */
export interface SftpFileInfo {
  /** 'd' = ディレクトリ, '-' = ファイル, 'l' = シンボリックリンク */
  type: string;
  name: string;
  size: number;
  /** 最終更新時刻（epoch ミリ秒） */
  modifyTime: number;
}

/** ssh2-sftp-client の Client のうちアダプタが利用するメソッドのみを表す構造型。 */
export interface SftpClientLike {
  connect(config: unknown): Promise<unknown>;
  end(): Promise<unknown>;
  list(remotePath: string): Promise<SftpFileInfo[]>;
  get(remotePath: string): Promise<string | Buffer>;
  put(input: Buffer, remotePath: string): Promise<unknown>;
  exists(remotePath: string): Promise<false | string>;
  delete(remotePath: string): Promise<unknown>;
  mkdir(remotePath: string, recursive?: boolean): Promise<unknown>;
  rename(fromPath: string, toPath: string): Promise<unknown>;
  chmod(remotePath: string, mode: number): Promise<unknown>;
}

/** ssh2-sftp-client の Client を RemoteTransport に適合させるアダプタ。 */
export class SftpTransport implements RemoteTransport {
  constructor(
    private readonly client: SftpClientLike,
    private readonly config: unknown = {},
  ) {}

  async connect(): Promise<void> {
    await this.client.connect(this.config);
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async list(remoteDir: string): Promise<RemoteEntry[]> {
    const infos = await this.client.list(remoteDir);
    return infos.map((info) => ({
      name: info.name,
      path: posixJoin(remoteDir, info.name),
      type: info.type === 'd' ? 'dir' : 'file',
      size: info.size,
      modifiedAt: info.modifyTime ? new Date(info.modifyTime) : null,
    }));
  }

  async readFile(remotePath: string): Promise<Buffer> {
    const payload = await this.client.get(remotePath);
    return Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  }

  async writeFile(remotePath: string, data: Buffer): Promise<void> {
    await this.client.put(data, remotePath);
  }

  async exists(remotePath: string): Promise<boolean> {
    return (await this.client.exists(remotePath)) !== false;
  }

  async directoryExists(remotePath: string): Promise<boolean> {
    return (await this.client.exists(remotePath)) === 'd';
  }

  async delete(remotePath: string): Promise<void> {
    await this.client.delete(remotePath);
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.mkdir(remotePath, true);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.rename(from, to);
  }

  async chmod(remotePath: string, mode: number): Promise<void> {
    await this.client.chmod(remotePath, mode);
  }
}
