import { Readable, Writable } from 'node:stream';
import { FileType } from 'basic-ftp';
import type { RemoteEntry, RemoteTransport } from './types';
import { posixBasename, posixDirname, posixJoin } from './path-utils';

/** basic-ftp の FileInfo のうちアダプタが参照する部分。 */
export interface FtpFileInfo {
  name: string;
  type: number;
  size: number;
  modifiedAt?: Date;
}

/** basic-ftp の Client のうちアダプタが利用するメソッドのみを表す構造型。 */
export interface FtpClientLike {
  access(options: unknown): Promise<unknown>;
  close(): void;
  list(path?: string): Promise<FtpFileInfo[]>;
  downloadTo(destination: NodeJS.WritableStream, fromRemotePath: string): Promise<unknown>;
  uploadFrom(source: NodeJS.ReadableStream, toRemotePath: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
  removeDir(remoteDirPath: string): Promise<unknown>;
  ensureDir(remoteDirPath: string): Promise<unknown>;
  rename(path: string, newPath: string): Promise<unknown>;
}

/** basic-ftp の Client を RemoteTransport に適合させるアダプタ。 */
export class FtpTransport implements RemoteTransport {
  constructor(
    private readonly client: FtpClientLike,
    private readonly accessOptions: unknown = {},
  ) {}

  async connect(): Promise<void> {
    await this.client.access(this.accessOptions);
  }

  async disconnect(): Promise<void> {
    this.client.close();
  }

  async list(remoteDir: string): Promise<RemoteEntry[]> {
    const infos = await this.client.list(remoteDir);
    return infos.map((info) => ({
      name: info.name,
      path: posixJoin(remoteDir, info.name),
      type: info.type === FileType.Directory ? 'dir' : 'file',
      size: info.size,
      modifiedAt: info.modifiedAt ?? null,
    }));
  }

  async readFile(remotePath: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });
    await this.client.downloadTo(sink, remotePath);
    return Buffer.concat(chunks);
  }

  async writeFile(remotePath: string, data: Buffer): Promise<void> {
    await this.client.uploadFrom(Readable.from(data), remotePath);
  }

  async exists(remotePath: string): Promise<boolean> {
    const base = posixBasename(remotePath);
    try {
      const infos = await this.client.list(posixDirname(remotePath));
      return infos.some((i) => i.name === base);
    } catch {
      return false;
    }
  }

  /**
   * FTP の DELE はファイル専用のため、失敗時はディレクトリとみなして
   * removeDir（再帰削除）へフォールバックする。両方失敗した場合は
   * 元の DELE のエラーを投げる（存在しないパス等の原因を保つ）。
   */
  async delete(remotePath: string): Promise<void> {
    try {
      await this.client.remove(remotePath);
    } catch (removeErr) {
      try {
        await this.client.removeDir(remotePath);
      } catch {
        throw removeErr;
      }
    }
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.ensureDir(remotePath);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.rename(from, to);
  }
}
