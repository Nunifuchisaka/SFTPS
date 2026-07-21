import { describe, it, expect } from 'vitest';
import { SftpTransport, type SftpClientLike, type SftpFileInfo } from './sftp-transport';

class FakeSftpClient implements SftpClientLike {
  connectConfig: unknown = null;
  ended = false;
  deleted: string[] = [];
  mkdirCalls: Array<{ path: string; recursive?: boolean }> = [];
  files = new Map<string, string | Buffer>();
  listings = new Map<string, SftpFileInfo[]>();
  existing = new Map<string, string>();

  async connect(config: unknown): Promise<unknown> {
    this.connectConfig = config;
    return {};
  }
  async end(): Promise<unknown> {
    this.ended = true;
    return {};
  }
  async list(remotePath: string): Promise<SftpFileInfo[]> {
    return this.listings.get(remotePath) ?? [];
  }
  async get(remotePath: string): Promise<string | Buffer> {
    const v = this.files.get(remotePath);
    if (v === undefined) throw new Error('No such file');
    return v;
  }
  async put(input: Buffer, remotePath: string): Promise<unknown> {
    this.files.set(remotePath, Buffer.from(input));
    return {};
  }
  async exists(remotePath: string): Promise<false | string> {
    return this.existing.get(remotePath) ?? false;
  }
  async delete(remotePath: string): Promise<unknown> {
    this.deleted.push(remotePath);
    return {};
  }
  async mkdir(remotePath: string, recursive?: boolean): Promise<unknown> {
    this.mkdirCalls.push({ path: remotePath, recursive });
    return {};
  }
  renamed: Array<{ from: string; to: string }> = [];
  async rename(from: string, to: string): Promise<unknown> {
    this.renamed.push({ from, to });
    return {};
  }
  chmodCalls: Array<{ path: string; mode: number }> = [];
  async chmod(remotePath: string, mode: number): Promise<unknown> {
    this.chmodCalls.push({ path: remotePath, mode });
    return {};
  }
}

describe('SftpTransport', () => {
  it('connect passes config; disconnect calls end', async () => {
    const fake = new FakeSftpClient();
    const config = { host: 'h', username: 'u' };
    const t = new SftpTransport(fake, config);
    await t.connect();
    await t.disconnect();
    expect(fake.connectConfig).toBe(config);
    expect(fake.ended).toBe(true);
  });

  it('list maps ssh2-sftp-client entries to RemoteEntry', async () => {
    const fake = new FakeSftpClient();
    fake.listings.set('/home', [
      { type: '-', name: 'note.txt', size: 12, modifyTime: 1_700_000_000_000 },
      { type: 'd', name: 'sub', size: 0, modifyTime: 0 },
    ]);
    const t = new SftpTransport(fake);
    const entries = await t.list('/home');
    expect(entries).toEqual([
      { name: 'note.txt', path: '/home/note.txt', type: 'file', size: 12, modifiedAt: new Date(1_700_000_000_000) },
      { name: 'sub', path: '/home/sub', type: 'dir', size: 0, modifiedAt: null },
    ]);
  });

  it('readFile returns a Buffer, coercing a string payload', async () => {
    const fake = new FakeSftpClient();
    fake.files.set('/a', Buffer.from('bin'));
    fake.files.set('/b', 'text');
    const t = new SftpTransport(fake);
    expect((await t.readFile('/a')).toString()).toBe('bin');
    const b = await t.readFile('/b');
    expect(Buffer.isBuffer(b)).toBe(true);
    expect(b.toString()).toBe('text');
  });

  it('writeFile puts the buffer', async () => {
    const fake = new FakeSftpClient();
    const t = new SftpTransport(fake);
    await t.writeFile('/up.txt', Buffer.from('data'));
    expect(fake.files.get('/up.txt')?.toString()).toBe('data');
  });

  it('exists returns true when the client returns a type char, false otherwise', async () => {
    const fake = new FakeSftpClient();
    fake.existing.set('/there', '-');
    const t = new SftpTransport(fake);
    expect(await t.exists('/there')).toBe(true);
    expect(await t.exists('/absent')).toBe(false);
  });

  it('delete calls delete; mkdir calls mkdir recursively', async () => {
    const fake = new FakeSftpClient();
    const t = new SftpTransport(fake);
    await t.delete('/x');
    await t.mkdir('/a/b/c');
    expect(fake.deleted).toEqual(['/x']);
    expect(fake.mkdirCalls).toEqual([{ path: '/a/b/c', recursive: true }]);
  });

  it('rename and chmod call the client methods', async () => {
    const fake = new FakeSftpClient();
    const t = new SftpTransport(fake);
    await t.rename('/a.txt', '/b.txt');
    await t.chmod('/b.txt', 0o644);
    expect(fake.renamed).toEqual([{ from: '/a.txt', to: '/b.txt' }]);
    expect(fake.chmodCalls).toEqual([{ path: '/b.txt', mode: 0o644 }]);
  });
});
