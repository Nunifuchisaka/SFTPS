import path from 'node:path';
import { LocalTransport, type RemoteEntry, type RemoteTransport } from '../core/transport/index';
import type { BackupInfo, BackupManager } from '../core/backup/index';
import {
  walkTree,
  planSync,
  summarizePlan,
  runSync,
  validateSyncDestination,
  type SyncEntry,
} from '../core/sync/index';
import { establishConnection, type ReconnectOptions } from '../core/reconnect/index';
import {
  extractSecrets,
  mergeSecrets,
  stripSecrets,
  validateProfile,
  type Profile,
} from '../core/profile/index';
import { planProfileDeletion } from '../core/profile/deletion';
import type { KnownHostEntry } from '../core/hostkey/index';
import { DEFAULT_SETTINGS, type AppSettings } from '../core/settings/index';
import {
  prepareUpload as corePrepareUpload,
  commitUpload as coreCommitUpload,
  type CommitResult,
  type UploadPreview,
} from '../core/upload/index';
import {
  prepareDownload as corePrepareDownload,
  commitDownload as coreCommitDownload,
  type DownloadPreview,
  type DownloadResult,
} from '../core/download/index';
import type { Bookmark, BookmarkInput, BookmarkStore } from '../core/bookmark/index';
import type { SecretStore } from './secret-store';
import type { ProfileStore } from './profile-store';
import type { Secrets } from './transport-factory';
import type {
  ConnectionResult,
  DeleteProfileOptions,
  DeleteProfileResult,
  RestoreBackupResult,
  SaveProfileOptions,
  SyncFolderOptions,
  PrepareSyncResult,
  CommitSyncResult,
} from '../shared/ipc';

/** キャンセル済みなら転送を開始せず中止する（ファイル単位の中断境界）。 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('transfer canceled');
}

/** シークレットレコードが同一内容か（不要な書き込みを避けるための比較）。 */
function sameSecrets(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}

/** ブックマークの読み書き口（実体は JSON ファイル永続化）。 */
export interface BookmarkGateway {
  load(): Promise<BookmarkStore>;
  save(store: BookmarkStore): Promise<void>;
}

/** 履歴のうち、プロファイル削除時の掃除に必要な操作だけを表す構造型。 */
export interface HistoryGateway {
  removeByProfile(profileId: string): number;
}

/** 信頼済みホスト鍵のうち、プロファイル削除時の掃除に必要な操作だけを表す構造型。 */
export interface KnownHostsGateway {
  list(): KnownHostEntry[];
  remove(host: string, port: number): Promise<boolean>;
}

export interface AppServiceDeps {
  profileStore: ProfileStore;
  secretStore: SecretStore;
  backupManager: BackupManager;
  bookmarkStore: BookmarkGateway;
  createTransport: (profile: Profile, secrets: Secrets) => RemoteTransport;
  /** 転送履歴（プロファイル削除時の掃除に使う。未指定なら履歴は掃除しない）。 */
  historyStore?: HistoryGateway;
  /** 信頼済みホスト鍵（同上）。 */
  knownHosts?: KnownHostsGateway;
  /** 現在のアプリ設定を返す（差分上限などに使う。未指定なら既定値）。 */
  settings?: () => AppSettings;
}

export type { DeleteProfileOptions, DeleteProfileResult };

/**
 * IPC ハンドラの中身となる純粋なアプリケーションサービス。
 * Electron / ipcMain には依存せず、単体テスト可能な形で全機能を提供する。
 */
export class AppService {
  constructor(private readonly deps: AppServiceDeps) {}

  async listProfiles(): Promise<Profile[]> {
    return this.deps.profileStore.list();
  }

  /**
   * プロファイルを保存する。シークレットは SecretStore へ分離し、
   * プロファイル JSON には決して平文で書かない。
   * 空欄のシークレットは既存値を据え置き（誤消去防止）、削除は options.clearSecrets の明示指定のみ。
   * シークレットの書き込みが必要なのに暗号化が使えない場合は保存を拒否する（例外）。
   */
  async saveProfile(input: Profile, options: SaveProfileOptions = {}): Promise<Profile> {
    const errors = validateProfile(input);
    if (errors.length > 0) {
      throw new Error(`invalid profile: ${errors.join(', ')}`);
    }

    const existing = (await this.deps.secretStore.getSecrets(input.id)) ?? {};
    const merged = mergeSecrets(existing, extractSecrets(input), options.clearSecrets ?? []);
    if (!sameSecrets(existing, merged)) {
      if (Object.keys(merged).length === 0) {
        await this.deps.secretStore.deleteSecrets(input.id);
      } else {
        // 暗号化が使えなければここで例外 → プロファイルは永続化されない。
        await this.deps.secretStore.setSecrets(input.id, merged);
      }
    }

    const stripped = stripSecrets(input);
    const profiles = await this.deps.profileStore.list();
    const next = profiles.filter((p) => p.id !== input.id);
    next.push(stripped);
    await this.deps.profileStore.saveAll(next);
    return stripped;
  }

  /**
   * プロファイルを削除する。プロファイル JSON とシークレットは常に消す。
   * ブックマーク・履歴・ホスト鍵（＝削除した接続先のパス情報）は removeRelatedData、
   * バックアップ（＝復旧手段でもあるファイル実体）は removeBackups の明示同意がある場合のみ消す。
   */
  async deleteProfile(
    id: string,
    options: DeleteProfileOptions = {},
  ): Promise<DeleteProfileResult> {
    const profiles = await this.deps.profileStore.list();
    // 不正な id はここで弾く（消し込み対象がパスとして使われるため、着手前に検証する）。
    const plan = planProfileDeletion(id, {
      profiles,
      knownHosts: this.deps.knownHosts?.list() ?? [],
      ...(options.removeRelatedData !== undefined
        ? { removeRelatedData: options.removeRelatedData }
        : {}),
      ...(options.removeBackups !== undefined ? { removeBackups: options.removeBackups } : {}),
    });

    await this.deps.profileStore.saveAll(profiles.filter((p) => p.id !== id));
    await this.deps.secretStore.deleteSecrets(id);

    const result: DeleteProfileResult = {
      removedBookmarks: 0,
      removedHistory: 0,
      removedKnownHosts: 0,
      purgedBackupNamespaces: 0,
    };

    if (plan.removeBookmarks) {
      const store = await this.deps.bookmarkStore.load();
      result.removedBookmarks = store.removeByProfile(id);
      if (result.removedBookmarks > 0) await this.deps.bookmarkStore.save(store);
    }
    if (plan.removeHistory) {
      result.removedHistory = this.deps.historyStore?.removeByProfile(id) ?? 0;
    }
    for (const host of plan.removeKnownHosts) {
      if (await this.deps.knownHosts?.remove(host.host, host.port)) result.removedKnownHosts++;
    }
    for (const namespace of plan.backupNamespaces) {
      await this.deps.backupManager.purgeNamespace(namespace);
      result.purgedBackupNamespaces++;
    }
    return result;
  }

  /** 現在の設定（未注入なら既定値）。 */
  private settings(): AppSettings {
    return this.deps.settings?.() ?? DEFAULT_SETTINGS;
  }

  async testConnection(id: string): Promise<ConnectionResult> {
    try {
      await this.withTransport(id, async () => undefined);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listRemote(id: string, remoteDir: string): Promise<RemoteEntry[]> {
    return this.withTransport(id, (transport) => transport.list(remoteDir));
  }

  async prepareUpload(id: string, localPath: string, remotePath: string): Promise<UploadPreview> {
    const maxDiffBytes = this.settings().diff.maxBytes;
    return this.withTransport(id, (transport) =>
      corePrepareUpload(transport, localPath, remotePath, { maxDiffBytes }),
    );
  }

  async commitUpload(
    id: string,
    localPath: string,
    remotePath: string,
    options: { verifyAfterTransfer?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<CommitResult> {
    return this.withTransport(
      id,
      (transport) =>
        coreCommitUpload(transport, this.deps.backupManager, id, localPath, remotePath, options),
      signal,
    );
  }

  /** ローカルフォルダとリモートディレクトリの差分同期プランを算出する（書き込みなし）。 */
  async prepareSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options: SyncFolderOptions = {},
  ): Promise<PrepareSyncResult> {
    return this.withTransport(id, async (dest) => {
      const computeHash = options.compareBy === 'checksum';
      const source = await this.openLocalSource(localDir);
      const sourceEntries = await walkTree(source, '/', { ignore: options.ignore, computeHash });
      const destEntries = await this.safeWalk(dest, remoteDir, options.ignore, computeHash);
      const plan = planSync(sourceEntries, destEntries, {
        compareBy: options.compareBy,
        deleteExtraneous: options.deleteExtraneous,
      });
      return { plan, summary: summarizePlan(plan) };
    });
  }

  /**
   * ローカルフォルダをリモートディレクトリへ差分同期する（上書き・削除は事前バックアップ）。
   * 宛先が空文字やサーバールートのまま実行されるのを main 側でも拒否する
   * （レンダラを介さないキュー経路にも同じガードを効かせるため）。
   */
  async commitSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options: SyncFolderOptions = {},
    signal?: AbortSignal,
  ): Promise<CommitSyncResult> {
    const check = validateSyncDestination(remoteDir, {
      deleteExtraneous: options.deleteExtraneous,
    });
    if (!check.ok) throw new Error(check.message);

    if (signal?.aborted) {
      // 接続もプラン算出もせずに中断（キャンセル済みタスクは着手しない）。
      return {
        result: { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [], canceled: true },
        summary: summarizePlan([]),
      };
    }

    return this.withTransport(id, async (dest) => {
      const computeHash = options.compareBy === 'checksum';
      const source = await this.openLocalSource(localDir);
      await dest.mkdir(remoteDir);
      const sourceEntries = await walkTree(source, '/', { ignore: options.ignore, computeHash });
      const destEntries = await this.safeWalk(dest, remoteDir, options.ignore, computeHash);
      const plan = planSync(sourceEntries, destEntries, {
        compareBy: options.compareBy,
        deleteExtraneous: options.deleteExtraneous,
      });
      const result = await runSync(source, dest, plan, {
        backupManager: this.deps.backupManager,
        profileId: id,
        sourceBase: '/',
        destBase: remoteDir,
        ...(signal ? { signal } : {}),
      });
      return { result, summary: summarizePlan(plan) };
    }, signal);
  }

  /**
   * リモートディレクトリをローカルフォルダへ差分ダウンロードする（commitSync の逆方向）。
   * source/dest を入れ替えるだけで core/sync の planner/runner をそのまま再利用できる
   * （walkTree/planSync/runSync はどちら向きの RemoteTransport にも依存しない設計のため）。
   */
  async commitDownloadSync(
    id: string,
    remoteDir: string,
    localDir: string,
    options: SyncFolderOptions = {},
    signal?: AbortSignal,
  ): Promise<CommitSyncResult> {
    if (signal?.aborted) {
      return {
        result: { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [], canceled: true },
        summary: summarizePlan([]),
      };
    }

    return this.withTransport(id, async (source) => {
      const computeHash = options.compareBy === 'checksum';
      const dest = await this.openLocalSource(localDir);
      const sourceEntries = await this.safeWalk(source, remoteDir, options.ignore, computeHash);
      const destEntries = await walkTree(dest, '/', { ignore: options.ignore, computeHash });
      const plan = planSync(sourceEntries, destEntries, {
        compareBy: options.compareBy,
        deleteExtraneous: options.deleteExtraneous,
      });
      const result = await runSync(source, dest, plan, {
        backupManager: this.deps.backupManager,
        profileId: id,
        sourceBase: remoteDir,
        destBase: '/',
        ...(signal ? { signal } : {}),
      });
      return { result, summary: summarizePlan(plan) };
    }, signal);
  }

  private async openLocalSource(localDir: string): Promise<LocalTransport> {
    const source = new LocalTransport(localDir);
    await source.connect();
    return source;
  }

  private async safeWalk(
    transport: RemoteTransport,
    dir: string,
    ignore?: string[],
    computeHash?: boolean,
  ): Promise<SyncEntry[]> {
    try {
      return await walkTree(transport, dir, { ignore, computeHash });
    } catch {
      // リモート側にディレクトリがまだ存在しない場合は空とみなす。
      return [];
    }
  }

  /** ダウンロード差分プレビュー（before=既存ローカル, after=リモート新内容）。 */
  async prepareDownload(id: string, remotePath: string, savePath: string): Promise<DownloadPreview> {
    const { local, localPath } = await this.openLocalTarget(savePath);
    const maxDiffBytes = this.settings().diff.maxBytes;
    return this.withTransport(id, (remote) =>
      corePrepareDownload(remote, local, remotePath, localPath, { maxDiffBytes }),
    );
  }

  /**
   * リモートファイルをローカルへダウンロードする（上書き前に既存ローカルをバックアップ）。
   * options は signal の後ろに置く（既存呼び出し元が signal を第4引数で渡しているため、
   * 位置を保ったまま任意の verifyAfterTransfer を追加できるようにする）。
   */
  async download(
    id: string,
    remotePath: string,
    savePath: string,
    signal?: AbortSignal,
    options: { verifyAfterTransfer?: boolean } = {},
  ): Promise<DownloadResult> {
    throwIfAborted(signal);
    const { local, localPath } = await this.openLocalTarget(savePath);
    return this.withTransport(
      id,
      (remote) =>
        coreCommitDownload(remote, local, this.deps.backupManager, id, remotePath, localPath, options),
      signal,
    );
  }

  private async openLocalTarget(savePath: string): Promise<{ local: LocalTransport; localPath: string }> {
    const local = new LocalTransport(path.dirname(savePath));
    await local.connect();
    return { local, localPath: `/${path.basename(savePath)}` };
  }

  /** リモートファイル/ディレクトリをリネーム（移動）する。 */
  async renameRemote(id: string, from: string, to: string): Promise<void> {
    return this.withTransport(id, async (transport) => {
      if (!transport.rename) throw new Error('rename is not supported by this transport');
      await transport.rename(from, to);
    });
  }

  /** リモートファイル/ディレクトリを削除する。 */
  async deleteRemote(id: string, remotePath: string): Promise<void> {
    return this.withTransport(id, (transport) => transport.delete(remotePath));
  }

  /** リモートファイルのパーミッションを変更する（対応トランスポートのみ）。 */
  async chmodRemote(id: string, remotePath: string, mode: number): Promise<void> {
    return this.withTransport(id, async (transport) => {
      if (!transport.chmod) throw new Error('chmod is not supported by this transport');
      await transport.chmod(remotePath, mode);
    });
  }

  /**
   * バックアップ系 API は IPC 引数の id をそのままファイルパスに使うため、
   * 実在するプロファイルの id 以外は受け付けない（未知の id での探索・書き込みを防ぐ）。
   */
  private async requireProfile(id: string): Promise<Profile> {
    const profiles = await this.deps.profileStore.list();
    const profile = profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`profile not found: ${id}`);
    return profile;
  }

  async listBackups(id: string, remotePath: string): Promise<BackupInfo[]> {
    await this.requireProfile(id);
    return this.deps.backupManager.listBackups(id, remotePath);
  }

  /**
   * バックアップ内容をリモートへ書き戻す（世代を指定しなければ最新）。
   * 復元も上書きであるため、書き戻す前に現在のリモート内容をバックアップする
   * （誤った世代を選んでも直前の状態へ戻せるようにする）。
   */
  async restoreBackup(
    id: string,
    remotePath: string,
    timestamp?: Date,
  ): Promise<RestoreBackupResult> {
    await this.requireProfile(id);
    const data = await this.deps.backupManager.restore(id, remotePath, timestamp);
    return this.withTransport(id, async (transport) => {
      const backupPath = await this.deps.backupManager.backupExisting(transport, id, remotePath);
      await transport.writeFile(remotePath, data);
      return { bytesWritten: data.length, backupPath };
    });
  }

  /** ブックマーク一覧（追加順。profileId 指定時はそのプロファイル分のみ）。 */
  async listBookmarks(profileId?: string): Promise<Bookmark[]> {
    const store = await this.deps.bookmarkStore.load();
    return store.list(profileId);
  }

  /** ブックマークを追加する（同一プロファイル・同一パスの重複は追加せず既存を返す）。 */
  async addBookmark(input: BookmarkInput): Promise<Bookmark> {
    const store = await this.deps.bookmarkStore.load();
    const added = store.add(input); // 不正入力はここで例外 → 保存しない
    await this.deps.bookmarkStore.save(store);
    return added;
  }

  async removeBookmark(id: string): Promise<void> {
    const store = await this.deps.bookmarkStore.load();
    store.remove(id);
    await this.deps.bookmarkStore.save(store);
  }

  async renameBookmark(id: string, name: string): Promise<Bookmark> {
    const store = await this.deps.bookmarkStore.load();
    const renamed = store.rename(id, name);
    await this.deps.bookmarkStore.save(store);
    return renamed;
  }

  private async resolveConnection(
    id: string,
  ): Promise<{ transport: RemoteTransport; reconnect: ReconnectOptions }> {
    const profile = await this.requireProfile(id);
    const secrets = (await this.deps.secretStore.getSecrets(id)) ?? {};
    const transport = this.deps.createTransport(profile, secrets);
    // autoReconnect 有効時は多段バックオフ、無効時は単発（初回失敗で即例外＝従来挙動）。
    const reconnect: ReconnectOptions = profile.autoReconnect
      ? { maxAttempts: 4, baseDelayMs: 1000, factor: 2, maxDelayMs: 30_000 }
      : { maxAttempts: 1, baseDelayMs: 1, factor: 2, maxDelayMs: 1 };
    return { transport, reconnect };
  }

  private async withTransport<T>(
    id: string,
    fn: (transport: RemoteTransport) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    throwIfAborted(signal);
    const { transport, reconnect } = await this.resolveConnection(id);
    await establishConnection(() => transport.connect(), reconnect);
    try {
      return await fn(transport);
    } finally {
      await transport.disconnect();
    }
  }
}
