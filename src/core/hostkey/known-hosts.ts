/** ホスト鍵検証の結果。 */
export type HostKeyVerdict = 'trusted' | 'unknown' | 'mismatch';

/** JSON 永続化用のデータ形状（"host:port" → フィンガープリント）。 */
export type KnownHostsData = Record<string, string>;

/** 信頼済みホスト1件（管理UI への提示用）。 */
export interface KnownHostEntry {
  host: string;
  port: number;
  fingerprint: string;
}

function keyOf(host: string, port: number): string {
  return `${host}:${port}`;
}

/** "host:port" を分解する。IPv6 表記を壊さないよう最後のコロンで区切る。 */
function splitKey(key: string): { host: string; port: number } | null {
  const idx = key.lastIndexOf(':');
  if (idx <= 0) return null;
  const port = Number(key.slice(idx + 1));
  if (!Number.isInteger(port)) return null;
  return { host: key.slice(0, idx), port };
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

  /** 信頼済みホストを登録順に列挙する（管理UI 用）。 */
  list(): KnownHostEntry[] {
    const entries: KnownHostEntry[] = [];
    for (const [key, fingerprint] of this.map) {
      const parsed = splitKey(key);
      if (parsed) entries.push({ host: parsed.host, port: parsed.port, fingerprint });
    }
    return entries;
  }

  /** 信頼を取り消す。該当があれば true。 */
  remove(host: string, port: number): boolean {
    return this.map.delete(keyOf(host, port));
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
