/** ホスト鍵検証の結果。 */
export type HostKeyVerdict = 'trusted' | 'unknown' | 'mismatch';

/** JSON 永続化用のデータ形状（"host:port" → フィンガープリント）。 */
export type KnownHostsData = Record<string, string>;

function keyOf(host: string, port: number): string {
  return `${host}:${port}`;
}

/**
 * 信頼済みホスト鍵フィンガープリントを host:port 単位で保持する純粋なストア。
 * ファイル I/O は持たず、シリアライズ/デシリアライズは別関数で行う。
 */
export class KnownHostsStore {
  private readonly map: Map<string, string>;

  constructor(data: KnownHostsData = {}) {
    this.map = new Map(Object.entries(data));
  }

  lookup(host: string, port: number): string | null {
    return this.map.get(keyOf(host, port)) ?? null;
  }

  verify(host: string, port: number, fingerprint: string): HostKeyVerdict {
    const known = this.lookup(host, port);
    if (known === null) return 'unknown';
    return known === fingerprint ? 'trusted' : 'mismatch';
  }

  add(host: string, port: number, fingerprint: string): void {
    this.map.set(keyOf(host, port), fingerprint);
  }

  toData(): KnownHostsData {
    return Object.fromEntries(this.map);
  }
}

export function serializeKnownHosts(store: KnownHostsStore): string {
  return JSON.stringify(store.toData(), null, 2);
}

export function parseKnownHosts(json: string): KnownHostsStore {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('known_hosts JSON must be an object');
  }
  const data: KnownHostsData = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') data[key] = value;
  }
  return new KnownHostsStore(data);
}
