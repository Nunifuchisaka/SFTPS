import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { RemoteTransport } from '../transport/types';
import {
  DEFAULT_BACKUP_RETENTION,
  planBackupRetention,
  type BackupRetention,
} from './retention';

export { confirmRestore, type RestoreConfirm } from './restore-guard';
export {
  planBackupRetention,
  DEFAULT_BACKUP_RETENTION,
  type BackupRetention,
  type BackupRetentionPlan,
} from './retention';

export interface BackupManagerOptions {
  /** バックアップ保存先のルートディレクトリ。 */
  backupRoot: string;
  /** 保持する世代数の上限（デフォルト 20）。 */
  maxGenerations?: number;
  /** 保持期間（日数）。null / 未指定なら無期限。 */
  maxAgeDays?: number | null;
  /** タイムスタンプ生成関数。テストで固定するため注入可能。 */
  now?: () => Date;
}

export interface BackupInfo {
  timestamp: Date;
  /** バックアップファイルの絶対パス。 */
  path: string;
  /** バックアップファイルのバイト数（復元確認で世代と併せて提示する）。 */
  size: number;
}

const STAMP_RE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/;

/**
 * リモートパスを固定長・衝突耐性のあるディレクトリキーへ変換する。
 * 旧来の文字置換は `/a/b` と `/a_b` が衝突するため使用しない。
 */
export function sanitizeRemotePath(remotePath: string): string {
  return `v2_${createHash('sha256').update(remotePath, 'utf8').digest('hex')}`;
}

/** バックアップ名前空間の 1 セグメントを、ディレクトリ名として安全な形に丸める。 */
function sanitizeSegment(segment: string): string {
  if (segment === '' || segment === '.' || segment === '..') return '_';
  return segment.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * バックアップ名前空間（profileId、または `<profileId>/download`）をパス構成要素として消毒する。
 * `/` 区切りの階層構造は保ったまま、各セグメントから親ディレクトリ参照・区切り文字を取り除き、
 * backupRoot の外へ出られないようにする（プロファイル ID の検証をすり抜けた場合の二重防御）。
 */
export function sanitizeBackupNamespace(namespace: string): string {
  return namespace.split('/').map(sanitizeSegment).join('/');
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Date を辞書順ソート可能・Windows 安全なタイムスタンプ文字列に変換する（UTC）。 */
function formatStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
    `-${pad(d.getUTCMilliseconds(), 3)}`
  );
}

/** タイムスタンプ文字列を Date に戻す。形式不正なら null。 */
function parseStamp(stem: string): Date | null {
  const m = STAMP_RE.exec(stem);
  if (!m) return null;
  return new Date(
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]),
  );
}

/**
 * アップロードによるリモート上書き前に、既存リモートファイルを
 * ローカルのバックアップ領域へ退避・世代管理する。
 */
export class BackupManager {
  private readonly backupRoot: string;
  private retention: BackupRetention;
  private readonly now: () => Date;

  constructor(options: BackupManagerOptions) {
    this.backupRoot = options.backupRoot;
    this.retention = {
      maxGenerations: options.maxGenerations ?? DEFAULT_BACKUP_RETENTION.maxGenerations,
      maxAgeDays: options.maxAgeDays ?? DEFAULT_BACKUP_RETENTION.maxAgeDays,
    };
    this.now = options.now ?? (() => new Date());
  }

  /** 現在の保持ポリシー。 */
  getRetention(): BackupRetention {
    return { ...this.retention };
  }

  /** 保持ポリシーを更新する（設定変更を実行中のアプリへ即反映するため）。 */
  setRetention(retention: Partial<BackupRetention>): void {
    this.retention = { ...this.retention, ...retention };
  }

  /**
   * リモートに存在する場合のみバックアップを取得する。
   * 存在しなければ null を返し、何も保存しない。
   * @returns 保存したバックアップファイルの絶対パス、またはスキップ時は null。
   */
  async backupExisting(
    transport: RemoteTransport,
    profileId: string,
    remotePath: string,
  ): Promise<string | null> {
    if (!(await transport.exists(remotePath))) return null;

    const data = await transport.readFile(remotePath);
    const dir = this.dirFor(profileId, remotePath);
    await mkdir(dir, { recursive: true });

    const now = this.now();
    const ext = path.posix.extname(remotePath);
    const file = path.join(dir, `${formatStamp(now)}${ext}`);
    await writeFile(file, data);

    await this.rotate(dir, now);
    return file;
  }

  /** 指定リモートパスのバックアップ世代を新しい順に返す。 */
  async listBackups(profileId: string, remotePath: string): Promise<BackupInfo[]> {
    const dir = this.dirFor(profileId, remotePath);
    const generations = await this.readGenerations(dir);
    return generations
      .map((g) => ({ timestamp: g.timestamp, path: path.join(dir, g.file), size: g.size }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * バックアップを復元してその内容を返す。
   * timestamp 未指定なら最新世代を返す。該当がなければ例外。
   */
  async restore(profileId: string, remotePath: string, timestamp?: Date): Promise<Buffer> {
    const dir = this.dirFor(profileId, remotePath);
    const generations = await this.readGenerations(dir);
    if (generations.length === 0) {
      throw new Error(`no backups found for ${remotePath}`);
    }

    let target;
    if (timestamp) {
      const wanted = formatStamp(timestamp);
      target = generations.find((g) => g.stem === wanted);
      if (!target) {
        throw new Error(`no backup at ${timestamp.toISOString()} for ${remotePath}`);
      }
    } else {
      target = generations.reduce((a, b) => (a.stem > b.stem ? a : b));
    }
    return readFile(path.join(dir, target.file));
  }

  private dirFor(profileId: string, remotePath: string): string {
    return path.join(
      this.backupRoot,
      sanitizeBackupNamespace(profileId),
      sanitizeRemotePath(remotePath),
    );
  }

  private async readGenerations(
    dir: string,
  ): Promise<Array<{ file: string; stem: string; timestamp: Date; size: number }>> {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const result: Array<{ file: string; stem: string; timestamp: Date; size: number }> = [];
    for (const file of files) {
      const stem = path.basename(file, path.extname(file));
      const ts = parseStamp(stem);
      if (ts) {
        const st = await stat(path.join(dir, file));
        result.push({ file, stem, timestamp: ts, size: st.size });
      }
    }
    return result;
  }

  /**
   * プロファイル削除に伴い、その名前空間のバックアップを丸ごと消す。
   * 名前空間は消毒してから使うため backupRoot の外は決して消さない。
   */
  async purgeNamespace(namespace: string): Promise<void> {
    const dir = path.join(this.backupRoot, sanitizeBackupNamespace(namespace));
    if (path.relative(this.backupRoot, dir).startsWith('..')) return;
    await rm(dir, { recursive: true, force: true });
  }

  /**
   * 保存済みの全バックアップに保持ポリシーを適用し、削除した件数を返す。
   * 上書き時のローテーションだけでは、以後触られないファイルの世代が
   * 保持期間を過ぎても残り続けるため、明示的な掃除口を用意する。
   */
  async pruneExpired(): Promise<number> {
    return this.pruneTree(this.backupRoot, this.now());
  }

  private async pruneTree(dir: string, now: Date): Promise<number> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let removed = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) removed += await this.pruneTree(path.join(dir, entry.name), now);
    }
    return removed + (await this.rotate(dir, now));
  }

  /** ディレクトリ内の世代へ保持ポリシーを適用し、削除件数を返す。 */
  private async rotate(dir: string, now: Date): Promise<number> {
    const generations = await this.readGenerations(dir);
    if (generations.length === 0) return 0;
    const plan = planBackupRetention(generations, this.retention, now);
    for (const generation of plan.remove) {
      await unlink(path.join(dir, generation.file));
    }
    return plan.remove.length;
  }
}
