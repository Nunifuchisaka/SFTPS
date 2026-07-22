import { describe, it, expect } from 'vitest';
import { FileType } from 'basic-ftp';
import { FtpTransport, type FtpClientLike, type FtpFileInfo } from './ftp-transport';
import type { RemoteTransport } from './types';

class FakeFtpClient implements FtpClientLike {
  accessCalls: unknown[] = [];
  closed = false;
  removed: string[] = [];
  ensured: string[] = [];
  files = new Map<string, Buffer>();
  listings = new Map<string, FtpFileInfo[]>();

  async access(options: unknown): Promise<unknown> {
    this.accessCalls.push(options);
    return {};
  }
  close(): void {
    this.closed = true;
  }
  async list(path = '/'): Promise<FtpFileInfo[]> {
    return this.listings.get(path) ?? [];
  }
  async downloadTo(dest: NodeJS.WritableStream, from: string): Promise<unknown> {
    const buf = this.files.get(from);
    if (!buf) throw new Error('550 File not found');
    await new Promise<void>((resolve, reject) => {
      dest.on('error', reject);
      dest.on('finish', () => resolve());
      dest.end(buf);
    });
    return {};
  }
  async uploadFrom(src: NodeJS.ReadableStream, to: string): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const c of src) chunks.push(Buffer.from(c as Buffer));
    this.files.set(to, Buffer.concat(chunks));
    return {};
  }
  /** DELE 相当。ファイル以外（ディレクトリ）は実サーバー同様 550 で失敗する。 */
  dirs = new Set<string>();
  removedDirs: string[] = [];
  async remove(path: string): Promise<unknown> {
    if (this.dirs.has(path)) throw new Error('550 Not a plain file');
    this.removed.push(path);
    this.files.delete(path);
    return {};
  }
  async removeDir(path: string): Promise<unknown> {
    if (!this.dirs.has(path)) throw new Error('550 No such directory');
    this.removedDirs.push(path);
    this.dirs.delete(path);
    return {};
  }
  async ensureDir(path: string): Promise<unknown> {
    this.ensured.push(path);
    return {};
  }
  renamed: Array<{ from: string; to: string }> = [];
  async rename(from: string, to: string): Promise<unknown> {
    this.renamed.push({ from, to });
    return {};
  }
}

describe('FtpTransport', () => {
  it('connect passes access options; disconnect closes the client', async () => {
    const fake = new FakeFtpClient();
    const opts = { host: 'example.com', user: 'u' };
    const t = new FtpTransport(fake, opts);
    await t.connect();
    await t.disconnect();
    expect(fake.accessCalls).toEqual([opts]);
    expect(fake.closed).toBe(true);
  });

  it('list maps basic-ftp FileInfo to RemoteEntry', async () => {
    const fake = new FakeFtpClient();
    const modified = new Date('2026-07-20T00:00:00Z');
    fake.listings.set('/pub', [
      { name: 'index.html', type: FileType.File, size: 42, modifiedAt: modified },
      { name: 'images', type: FileType.Directory, size: 0 },
    ]);
    const t = new FtpTransport(fake);
    const entries = await t.list('/pub');
    expect(entries).toEqual([
      { name: 'index.html', path: '/pub/index.html', type: 'file', size: 42, modifiedAt: modified },
      { name: 'images', path: '/pub/images', type: 'dir', size: 0, modifiedAt: null },
    ]);
  });

  it('readFile collects the download stream into a Buffer', async () => {
    const fake = new FakeFtpClient();
    fake.files.set('/pub/a.txt', Buffer.from('hello ftp', 'utf8'));
    const t = new FtpTransport(fake);
    const buf = await t.readFile('/pub/a.txt');
    expect(buf.toString('utf8')).toBe('hello ftp');
  });

  it('writeFile streams the buffer to uploadFrom', async () => {
    const fake = new FakeFtpClient();
    const t = new FtpTransport(fake);
    await t.writeFile('/pub/b.txt', Buffer.from('uploaded', 'utf8'));
    expect(fake.files.get('/pub/b.txt')?.toString('utf8')).toBe('uploaded');
  });

  it('exists checks the parent listing', async () => {
    const fake = new FakeFtpClient();
    fake.listings.set('/pub', [{ name: 'a.txt', type: FileType.File, size: 1 }]);
    const t = new FtpTransport(fake);
    expect(await t.exists('/pub/a.txt')).toBe(true);
    expect(await t.exists('/pub/missing.txt')).toBe(false);
  });

  it('delete calls remove; mkdir calls ensureDir', async () => {
    const fake = new FakeFtpClient();
    const t = new FtpTransport(fake);
    await t.delete('/pub/x.txt');
    await t.mkdir('/pub/new');
    expect(fake.removed).toEqual(['/pub/x.txt']);
    expect(fake.ensured).toEqual(['/pub/new']);
  });

  it('delete falls back to removeDir for directories (DELE is file-only)', async () => {
    const fake = new FakeFtpClient();
    fake.dirs.add('/pub/images');
    const t = new FtpTransport(fake);
    await t.delete('/pub/images');
    expect(fake.removedDirs).toEqual(['/pub/images']);
    expect(fake.removed).toEqual([]);
  });

  it('delete rethrows the original DELE error when the path is neither file nor dir', async () => {
    const fake = new FakeFtpClient();
    fake.remove = async () => {
      throw new Error('550 No such file');
    };
    const t = new FtpTransport(fake);
    await expect(t.delete('/pub/missing')).rejects.toThrow('550 No such file');
  });

  it('rename calls the client rename with from/to', async () => {
    const fake = new FakeFtpClient();
    const t = new FtpTransport(fake);
    await t.rename('/pub/a.txt', '/pub/b.txt');
    expect(fake.renamed).toEqual([{ from: '/pub/a.txt', to: '/pub/b.txt' }]);
  });

  it('does not expose chmod (FTP has no portable chmod)', () => {
    const t: RemoteTransport = new FtpTransport(new FakeFtpClient());
    expect(t.chmod).toBeUndefined();
  });
});
