import { describe, it, expect } from 'vitest';
import { S3Transport, type S3ClientLike } from './s3-transport';
import type { RemoteTransport } from './types';

interface ListResponse {
  CommonPrefixes?: Array<{ Prefix?: string }>;
  Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}

class FakeS3Client implements S3ClientLike {
  objects = new Map<string, Buffer>();
  listByPrefix = new Map<string, ListResponse>();
  listPages: ListResponse[] = [];
  puts: Array<{ Key: string; Body: Buffer }> = [];
  deletes: string[] = [];
  copies: Array<{ CopySource: string; Key: string }> = [];
  destroyed = false;

  async send(command: { constructor: { name: string }; input: any }): Promise<any> {
    const name = command.constructor.name;
    const input = command.input;
    switch (name) {
      case 'ListObjectsV2Command':
        if (this.listPages.length > 0) return this.listPages.shift() ?? {};
        return this.listByPrefix.get(String(input.Prefix ?? '')) ?? {};
      case 'GetObjectCommand': {
        const key = String(input.Key);
        const buf = this.objects.get(key);
        if (!buf) throw notFound();
        return { Body: { transformToByteArray: async () => new Uint8Array(buf) } };
      }
      case 'PutObjectCommand': {
        const key = String(input.Key);
        const body = input.Body;
        const buf = typeof body === 'string' ? Buffer.from(body) : Buffer.from((body as Buffer) ?? Buffer.alloc(0));
        this.objects.set(key, buf);
        this.puts.push({ Key: key, Body: buf });
        return {};
      }
      case 'CopyObjectCommand': {
        const source = String(input.CopySource);
        const key = String(input.Key);
        this.copies.push({ CopySource: source, Key: key });
        const sourceKey = source.slice(source.indexOf('/') + 1);
        const buf = this.objects.get(sourceKey);
        if (buf) this.objects.set(key, buf);
        return {};
      }
      case 'DeleteObjectCommand': {
        const key = String(input.Key);
        this.deletes.push(key);
        this.objects.delete(key);
        return {};
      }
      case 'HeadObjectCommand': {
        const key = String(input.Key);
        if (!this.objects.has(key)) throw notFound();
        return { ContentLength: this.objects.get(key)!.length };
      }
      default:
        throw new Error(`unexpected command: ${name}`);
    }
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function notFound(): Error {
  const e = new Error('NotFound') as Error & { name: string; $metadata: { httpStatusCode: number } };
  e.name = 'NotFound';
  e.$metadata = { httpStatusCode: 404 };
  return e;
}

describe('S3Transport', () => {
  it('disconnect destroys the client', async () => {
    const fake = new FakeS3Client();
    const t = new S3Transport(fake, 'my-bucket');
    await t.connect();
    await t.disconnect();
    expect(fake.destroyed).toBe(true);
  });

  it('list maps CommonPrefixes to dirs and Contents to files, excluding the folder marker', async () => {
    const fake = new FakeS3Client();
    const modified = new Date('2026-07-20T12:00:00Z');
    fake.listByPrefix.set('photos/', {
      CommonPrefixes: [{ Prefix: 'photos/sub/' }],
      Contents: [
        { Key: 'photos/', Size: 0 }, // フォルダマーカー（自分自身）は除外される
        { Key: 'photos/a.jpg', Size: 100, LastModified: modified },
      ],
    });
    const t = new S3Transport(fake, 'my-bucket');
    const entries = await t.list('/photos');
    expect(entries).toEqual([
      { name: 'sub', path: '/photos/sub', type: 'dir', size: 0, modifiedAt: null },
      { name: 'a.jpg', path: '/photos/a.jpg', type: 'file', size: 100, modifiedAt: modified },
    ]);
  });

  it('list at root uses an empty prefix', async () => {
    const fake = new FakeS3Client();
    fake.listByPrefix.set('', {
      CommonPrefixes: [{ Prefix: 'dir1/' }],
      Contents: [{ Key: 'top.txt', Size: 5 }],
    });
    const t = new S3Transport(fake, 'my-bucket');
    const entries = await t.list('/');
    expect(entries.map((e) => `${e.type}:${e.path}`)).toEqual(['dir:/dir1', 'file:/top.txt']);
  });

  it('follows continuation tokens until every page has been listed', async () => {
    const fake = new FakeS3Client();
    fake.listPages.push(
      {
        Contents: [{ Key: 'a.txt', Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      },
      { Contents: [{ Key: 'b.txt', Size: 2 }], IsTruncated: false },
    );
    const t = new S3Transport(fake, 'my-bucket');
    const entries = await t.list('/');
    expect(entries.map((entry) => entry.path)).toEqual(['/a.txt', '/b.txt']);
  });

  it('fails closed when a truncated response has no continuation token', async () => {
    const fake = new FakeS3Client();
    fake.listPages.push({ IsTruncated: true });
    const t = new S3Transport(fake, 'my-bucket');
    await expect(t.list('/')).rejects.toThrow('continuation token');
  });

  it('readFile normalizes the path to a key (strips leading slash) and reads the body', async () => {
    const fake = new FakeS3Client();
    fake.objects.set('photos/a.txt', Buffer.from('s3 body', 'utf8'));
    const t = new S3Transport(fake, 'my-bucket');
    expect((await t.readFile('/photos/a.txt')).toString('utf8')).toBe('s3 body');
    expect((await t.readFile('photos/a.txt')).toString('utf8')).toBe('s3 body');
  });

  it('writeFile stores under a normalized key without leading/duplicate slashes', async () => {
    const fake = new FakeS3Client();
    const t = new S3Transport(fake, 'my-bucket');
    await t.writeFile('///photos//d.txt', Buffer.from('x'));
    expect([...fake.objects.keys()]).toEqual(['photos/d.txt']);
  });

  it('exists uses HeadObject, treating 404 as false', async () => {
    const fake = new FakeS3Client();
    fake.objects.set('here.txt', Buffer.from('y'));
    const t = new S3Transport(fake, 'my-bucket');
    expect(await t.exists('/here.txt')).toBe(true);
    expect(await t.exists('/missing.txt')).toBe(false);
  });

  it('delete removes the object by key', async () => {
    const fake = new FakeS3Client();
    fake.objects.set('gone.txt', Buffer.from('z'));
    const t = new S3Transport(fake, 'my-bucket');
    await t.delete('/gone.txt');
    expect(fake.deletes).toEqual(['gone.txt']);
    expect(fake.objects.has('gone.txt')).toBe(false);
  });

  it('mkdir puts an empty object with a trailing-slash key', async () => {
    const fake = new FakeS3Client();
    const t = new S3Transport(fake, 'my-bucket');
    await t.mkdir('/photos/newdir');
    const marker = fake.puts.find((p) => p.Key === 'photos/newdir/');
    expect(marker).toBeDefined();
    expect(marker!.Body.length).toBe(0);
  });

  it('rename copies to the new key then deletes the old (no native rename)', async () => {
    const fake = new FakeS3Client();
    fake.objects.set('old/a.txt', Buffer.from('data'));
    const t = new S3Transport(fake, 'my-bucket');
    await t.rename('/old/a.txt', '/new/a.txt');
    expect(fake.copies).toContainEqual({ CopySource: 'my-bucket/old/a.txt', Key: 'new/a.txt' });
    expect(fake.deletes).toContain('old/a.txt');
    expect(fake.objects.has('new/a.txt')).toBe(true);
    expect(fake.objects.has('old/a.txt')).toBe(false);
  });

  it('does not expose chmod (S3 uses ACLs, not POSIX modes)', () => {
    const t: RemoteTransport = new S3Transport(new FakeS3Client(), 'my-bucket');
    expect(t.chmod).toBeUndefined();
  });
});
