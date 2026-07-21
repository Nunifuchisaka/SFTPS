import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import type { RemoteEntry, RemoteTransport } from './types';

/** S3Client の send のうちアダプタが利用するオーバーロードのみを表す構造型。 */
export interface S3ClientLike {
  send(command: ListObjectsV2Command): Promise<ListObjectsV2CommandOutput>;
  send(command: GetObjectCommand): Promise<GetObjectCommandOutput>;
  send(command: PutObjectCommand): Promise<unknown>;
  send(command: DeleteObjectCommand): Promise<unknown>;
  send(command: HeadObjectCommand): Promise<unknown>;
  send(command: CopyObjectCommand): Promise<unknown>;
  destroy?(): void;
}

/** リモートパスを S3 オブジェクトキーへ正規化する（先頭/重複スラッシュを除去）。 */
function toKey(remotePath: string): string {
  return remotePath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

/** ディレクトリパスを list / mkdir 用のプレフィックス（末尾スラッシュ付き）へ正規化する。 */
function toPrefix(remoteDir: string): string {
  const key = toKey(remoteDir);
  if (key === '') return '';
  return key.endsWith('/') ? key : `${key}/`;
}

/** キーの末尾要素（ベース名）を取り出す。末尾スラッシュは無視する。 */
function keyBasename(key: string): string {
  const trimmed = key.replace(/\/$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * Amazon S3 を RemoteTransport に適合させるアダプタ。
 * S3 にはディレクトリ概念がないため、`/` 区切りのプレフィックスと
 * ListObjectsV2 の CommonPrefixes を用いてディレクトリを擬似的に表現する。
 */
export class S3Transport implements RemoteTransport {
  constructor(
    private readonly client: S3ClientLike,
    private readonly bucket: string,
  ) {}

  async connect(): Promise<void> {
    // S3 はステートレスなため接続処理は不要。
  }

  async disconnect(): Promise<void> {
    this.client.destroy?.();
  }

  async list(remoteDir: string): Promise<RemoteEntry[]> {
    const prefix = toPrefix(remoteDir);
    const out = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, Delimiter: '/' }),
    );

    const dirs: RemoteEntry[] = (out.CommonPrefixes ?? []).map((cp) => {
      const full = (cp.Prefix ?? '').replace(/\/$/, '');
      return {
        name: keyBasename(full),
        path: `/${full}`,
        type: 'dir',
        size: 0,
        modifiedAt: null,
      };
    });

    const files: RemoteEntry[] = (out.Contents ?? [])
      .filter((o) => (o.Key ?? '') !== prefix)
      .map((o) => {
        const key = o.Key ?? '';
        return {
          name: keyBasename(key),
          path: `/${key}`,
          type: 'file' as const,
          size: o.Size ?? 0,
          modifiedAt: o.LastModified ?? null,
        };
      });

    return [...dirs, ...files];
  }

  async readFile(remotePath: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: toKey(remotePath) }),
    );
    const body = out.Body;
    if (!body) return Buffer.alloc(0);
    return Buffer.from(await body.transformToByteArray());
  }

  async writeFile(remotePath: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: toKey(remotePath), Body: data }),
    );
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: toKey(remotePath) }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async delete(remotePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: toKey(remotePath) }),
    );
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: toPrefix(remotePath), Body: '' }),
    );
  }

  /** S3 にネイティブな rename は無いため copy + delete で疑似実装する。 */
  async rename(from: string, to: string): Promise<void> {
    const fromKey = toKey(from);
    const toKeyValue = toKey(to);
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${fromKey}`,
        Key: toKeyValue,
      }),
    );
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: fromKey }));
  }
}
