import { readdir, readFile, writeFile, mkdir, rm, stat, rename, chmod } from 'node:fs/promises';
import path from 'node:path';
import type { RemoteEntry, RemoteTransport } from './types';
import { posixJoin, toPosixPath } from './path-utils';

/**
 * ローカルファイルシステムを RemoteTransport として扱う実装。
 * バックアップ・差分・アップロードなど上位機能をモックなしで検証するために使う。
 */
export class LocalTransport implements RemoteTransport {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  async connect(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async disconnect(): Promise<void> {
    // ローカルFSでは切断処理は不要。
  }

  async list(remoteDir: string): Promise<RemoteEntry[]> {
    const dirNorm = toPosixPath(remoteDir);
    const full = this.resolve(remoteDir);
    const dirents = await readdir(full, { withFileTypes: true });
    const entries: RemoteEntry[] = [];
    for (const d of dirents) {
      const childFull = path.join(full, d.name);
      const st = await stat(childFull);
      entries.push({
        name: d.name,
        path: posixJoin(dirNorm, d.name),
        type: d.isDirectory() ? 'dir' : 'file',
        size: st.size,
        modifiedAt: st.mtime,
      });
    }
    return entries;
  }

  async readFile(remotePath: string): Promise<Buffer> {
    return readFile(this.resolve(remotePath));
  }

  async writeFile(remotePath: string, data: Buffer): Promise<void> {
    const full = this.resolve(remotePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      await stat(this.resolve(remotePath));
      return true;
    } catch {
      return false;
    }
  }

  async delete(remotePath: string): Promise<void> {
    await rm(this.resolve(remotePath), { recursive: true, force: true });
  }

  async mkdir(remotePath: string): Promise<void> {
    await mkdir(this.resolve(remotePath), { recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    await rename(this.resolve(from), this.resolve(to));
  }

  async chmod(remotePath: string, mode: number): Promise<void> {
    await chmod(this.resolve(remotePath), mode);
  }

  private resolve(remotePath: string): string {
    const rel = toPosixPath(remotePath).replace(/^\/+/, '');
    const segments = rel.split('/').filter(Boolean);
    const full = path.resolve(this.root, ...segments);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`path escapes transport root: ${remotePath}`);
    }
    return full;
  }
}
