import { SECRET_KEYS } from '../profile/index';

export type HistoryKind = 'upload' | 'download' | 'sync' | 'rename' | 'delete' | 'chmod';
export type HistoryStatus = 'success' | 'failed';

export interface HistoryEntry {
  id: string;
  /** ISO 8601 タイムスタンプ（注入された now から生成）。 */
  timestamp: string;
  kind: HistoryKind;
  profileId: string;
  path: string;
  status: HistoryStatus;
  bytes?: number;
  /** 失敗時のエラー要約（呼び出し側でスタックトレース・シークレットを除いた message のみ）。 */
  error?: string;
}

/** append の入力（timestamp は付与しない）。 */
export type HistoryInput = Omit<HistoryEntry, 'timestamp'>;

export interface HistoryFilter {
  kind?: HistoryKind;
  status?: HistoryStatus;
  profileId?: string;
}

export interface HistoryStoreOptions {
  maxEntries?: number;
  now?: () => Date;
  initial?: HistoryEntry[];
}

const DEFAULT_MAX = 500;

/** HistoryEntry に許可されたフィールドのみ（ホワイトリスト）。 */
function sanitizeInput(input: HistoryInput): HistoryInput {
  const source = input as unknown as Record<string, unknown>;
  for (const key of SECRET_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      throw new Error(`secret field "${key}" must not be recorded in history`);
    }
  }
  const clean: HistoryInput = {
    id: input.id,
    kind: input.kind,
    profileId: input.profileId,
    path: input.path,
    status: input.status,
  };
  if (input.bytes !== undefined) clean.bytes = input.bytes;
  if (input.error !== undefined) clean.error = input.error;
  return clean;
}

/**
 * 転送・リモート操作の履歴を保持する純粋なストア。
 * シークレットは決して記録せず（混入したら例外）、ホワイトリストのフィールドのみ保持する。
 */
export class HistoryStore {
  private entries: HistoryEntry[];
  private readonly maxEntries: number;
  private readonly now: () => Date;

  constructor(options: HistoryStoreOptions = {}) {
    this.entries = options.initial ? [...options.initial] : [];
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX;
    this.now = options.now ?? (() => new Date());
  }

  append(input: HistoryInput): HistoryEntry {
    const clean = sanitizeInput(input);
    const entry: HistoryEntry = { ...clean, timestamp: this.now().toISOString() };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
    return entry;
  }

  /** 新しい順に返す（任意でフィルタ）。 */
  list(filter: HistoryFilter = {}): HistoryEntry[] {
    return this.entries
      .filter(
        (e) =>
          (filter.kind === undefined || e.kind === filter.kind) &&
          (filter.status === undefined || e.status === filter.status) &&
          (filter.profileId === undefined || e.profileId === filter.profileId),
      )
      .slice()
      .reverse();
  }

  clear(): void {
    this.entries = [];
  }

  toData(): HistoryEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }
}

export function serializeHistory(store: HistoryStore): string {
  return JSON.stringify(store.toData(), null, 2);
}

export function parseHistory(json: string): HistoryEntry[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error('history JSON must be an array');
  return raw.map((item) => {
    const clean = sanitizeInput(item as HistoryInput);
    return { ...clean, timestamp: String((item as HistoryEntry).timestamp) };
  });
}
