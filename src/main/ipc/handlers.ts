import type { Profile } from '../../core/profile/index';
import type { RemoteEntry } from '../../core/transport/index';
import type { UploadPreview, CommitResult } from '../../core/upload/index';
import type { DownloadPreview, DownloadResult } from '../../core/download/index';
import type { BackupInfo } from '../../core/backup/index';
import type { Bookmark, BookmarkInput } from '../../core/bookmark/index';
import type { HistoryEntry, HistoryFilter, HistoryInput } from '../../core/history/index';
import type { KnownHostEntry } from '../../core/hostkey/index';
import type { AppSettings } from '../../core/settings/index';
import {
  QueueDriver,
  type AddTaskInput,
  type OverallProgress,
  type TransferTask,
} from '../../core/queue/index';
import type {
  ConnectionResult,
  CommitSyncResult,
  PrepareSyncResult,
  QueueStatus,
  RestoreBackupResult,
  SaveProfileOptions,
  SyncFolderOptions,
  TransferRequest,
} from '../../shared/ipc';
import type { DeleteProfileOptions, DeleteProfileResult } from '../app-service';
import type { TerminalTaskRecorder } from '../history-recorder';

/** ハンドラが依存する AppService のメソッド（構造的サブセット）。 */
export interface IpcService {
  listProfiles(): Promise<Profile[]>;
  saveProfile(input: Profile, options?: SaveProfileOptions): Promise<Profile>;
  deleteProfile(id: string, options?: DeleteProfileOptions): Promise<DeleteProfileResult>;
  testConnection(id: string): Promise<ConnectionResult>;
  listRemote(id: string, remoteDir: string): Promise<RemoteEntry[]>;
  prepareUpload(id: string, localPath: string, remotePath: string): Promise<UploadPreview>;
  commitUpload(
    id: string,
    localPath: string,
    remotePath: string,
    options?: { verifyAfterTransfer?: boolean },
  ): Promise<CommitResult>;
  prepareSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options?: SyncFolderOptions,
  ): Promise<PrepareSyncResult>;
  commitSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options?: SyncFolderOptions,
  ): Promise<CommitSyncResult>;
  prepareDownload(id: string, remotePath: string, savePath: string): Promise<DownloadPreview>;
  download(id: string, remotePath: string, savePath: string): Promise<DownloadResult>;
  renameRemote(id: string, from: string, to: string): Promise<void>;
  deleteRemote(id: string, remotePath: string): Promise<void>;
  chmodRemote(id: string, remotePath: string, mode: number): Promise<void>;
  listBookmarks(profileId?: string): Promise<Bookmark[]>;
  addBookmark(input: BookmarkInput): Promise<Bookmark>;
  removeBookmark(id: string): Promise<void>;
  renameBookmark(id: string, name: string): Promise<Bookmark>;
  listBackups(id: string, remotePath: string): Promise<BackupInfo[]>;
  restoreBackup(id: string, remotePath: string, timestamp?: Date): Promise<RestoreBackupResult>;
}

/** ハンドラが依存する TransferQueue のメソッド（構造的サブセット）。 */
export interface IpcQueue {
  add(input: AddTaskInput): TransferTask;
  list(): TransferTask[];
  overall(): OverallProgress;
  run(): Promise<void>;
  cancelAll(): void;
  clearCompleted(): TransferTask[];
}

/** 履歴の記録・参照口（永続化を内包）。 */
export interface HistoryController {
  append(input: HistoryInput): void;
  list(filter?: HistoryFilter): HistoryEntry[];
  clear(): void;
}

/** 信頼済みホスト鍵の参照・取り消し口。 */
export interface KnownHostsApi {
  list(): KnownHostEntry[];
  remove(host: string, port: number): Promise<boolean>;
}

/** アプリ設定の参照・保存口（保存時の反映は実装側の責務）。 */
export interface SettingsApi {
  get(): AppSettings;
  save(input: unknown): Promise<AppSettings>;
}

export interface IpcHandlerDeps {
  service: IpcService;
  queue: IpcQueue;
  /** 終端タスクの履歴記録（キューの onEvict と共有すること）。 */
  recorder: TerminalTaskRecorder;
  history: HistoryController;
  knownHosts: KnownHostsApi;
  settings: SettingsApi;
  listLocal(dir: string): Promise<RemoteEntry[]>;
  homeDir(): string;
  isSecretStorageAvailable(): boolean;
  pickFile(): Promise<string | null>;
  pickDirectory(): Promise<string | null>;
  pickSavePath(defaultName: string): Promise<string | null>;
  /** id 生成に使う時刻（テストで固定するため注入可能）。 */
  now?: () => number;
  /** 駆動中の例外の通知先（既定は console.error）。 */
  onDriveError?: (err: unknown) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * IPC ハンドラの実体。ipcMain には依存しないため単体テストできる。
 * register.ts は「チャンネル名 → ここのメソッド」の結線だけを行う。
 */
export function createIpcHandlers(deps: IpcHandlerDeps) {
  const now = deps.now ?? (() => Date.now());
  const onDriveError =
    deps.onDriveError ?? ((err: unknown) => console.error('[sftps] queue drive failed:', err));
  let seq = 0;
  const genId = (prefix: string): string => `${prefix}${now()}-${seq++}`;

  // キューは run() 実行中に新規タスクを拾わないため、投入のたびに
  // 「未処理が無くなるまで run を回す」ドライバで駆動する。
  // 完走後、終端タスクを id 重複排除して一度だけ履歴へ記録し、
  // 記録済み id はキューに残っているタスクへ追随させる（単調増加させない）。
  const driver = new QueueDriver({
    hasPending: () => deps.queue.list().some((t) => t.status === 'queued'),
    run: () => deps.queue.run(),
    onDrained: () => {
      const tasks = deps.queue.list();
      deps.recorder.record(tasks);
      deps.recorder.sweep(tasks.map((t) => t.id));
    },
  });

  let driving: Promise<void> | null = null;
  const drive = (): void => {
    if (driving) {
      // 実行中なら要求だけ立てる（ドライバ側が完走後に拾い直す）。
      void driver.request();
      return;
    }
    driving = driver
      .request()
      .catch(onDriveError)
      .finally(() => {
        driving = null;
      });
  };

  const recordOperation = async (
    kind: 'rename' | 'delete' | 'chmod',
    profileId: string,
    successPath: string,
    failurePath: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    try {
      await action();
      deps.history.append({
        id: genId('op'),
        kind,
        profileId,
        path: successPath,
        status: 'success',
      });
    } catch (err) {
      deps.history.append({
        id: genId('op'),
        kind,
        profileId,
        path: failurePath,
        status: 'failed',
        error: errorMessage(err),
      });
      throw err;
    }
  };

  return {
    // ---- transfer queue ----
    enqueueTransfer(request: TransferRequest): string {
      const id = genId('t');
      deps.queue.add({ id, kind: request.kind, label: request.label, payload: request });
      drive();
      return id;
    },
    queueStatus(): QueueStatus {
      return { tasks: deps.queue.list(), overall: deps.queue.overall() };
    },
    cancelAllTasks(): void {
      deps.queue.cancelAll();
    },
    /** 完了タスクを破棄する（履歴には記録済み）。戻り値は破棄件数。 */
    clearCompletedTasks(): number {
      const dropped = deps.queue.clearCompleted();
      deps.recorder.record(dropped);
      deps.recorder.sweep(deps.queue.list().map((t) => t.id));
      return dropped.length;
    },
    /** 駆動中のキューが落ち着くまで待つ（テスト・終了処理用）。 */
    async whenIdle(): Promise<void> {
      while (driving) await driving;
    },
    /** 重複排除に使っている記録済み id の件数（診断用）。 */
    recordedTaskCount(): number {
      return deps.recorder.recordedCount;
    },

    // ---- history ----
    historyList(filter?: HistoryFilter): HistoryEntry[] {
      return deps.history.list(filter);
    },
    historyClear(): void {
      deps.history.clear();
    },

    // ---- profiles / settings ----
    listProfiles: () => deps.service.listProfiles(),
    saveProfile: (input: Profile, options?: SaveProfileOptions) =>
      deps.service.saveProfile(input, options),
    deleteProfile: (id: string, options?: DeleteProfileOptions) =>
      deps.service.deleteProfile(id, options),
    getSettings: (): AppSettings => deps.settings.get(),
    saveSettings: (input: unknown): Promise<AppSettings> => deps.settings.save(input),

    // ---- connection / browse ----
    testConnection: (id: string) => deps.service.testConnection(id),
    listRemote: (id: string, dir: string) => deps.service.listRemote(id, dir),
    prepareUpload: (id: string, local: string, remote: string) =>
      deps.service.prepareUpload(id, local, remote),
    commitUpload: (
      id: string,
      local: string,
      remote: string,
      options?: { verifyAfterTransfer?: boolean },
    ) => deps.service.commitUpload(id, local, remote, options),
    prepareSync: (id: string, localDir: string, remoteDir: string, options?: SyncFolderOptions) =>
      deps.service.prepareSync(id, localDir, remoteDir, options),
    commitSync: (id: string, localDir: string, remoteDir: string, options?: SyncFolderOptions) =>
      deps.service.commitSync(id, localDir, remoteDir, options),
    prepareDownload: (id: string, remote: string, save: string) =>
      deps.service.prepareDownload(id, remote, save),
    download: (id: string, remote: string, save: string) => deps.service.download(id, remote, save),

    // ---- remote operations（履歴を残す） ----
    renameRemote(id: string, from: string, to: string): Promise<void> {
      return recordOperation('rename', id, to, from, () => deps.service.renameRemote(id, from, to));
    },
    deleteRemote(id: string, remote: string): Promise<void> {
      return recordOperation('delete', id, remote, remote, () =>
        deps.service.deleteRemote(id, remote),
      );
    },
    chmodRemote(id: string, remote: string, mode: number): Promise<void> {
      return recordOperation('chmod', id, remote, remote, () =>
        deps.service.chmodRemote(id, remote, mode),
      );
    },

    // ---- bookmarks / backups / host keys ----
    listBookmarks: (profileId?: string) => deps.service.listBookmarks(profileId),
    addBookmark: (input: BookmarkInput) => deps.service.addBookmark(input),
    removeBookmark: (id: string) => deps.service.removeBookmark(id),
    renameBookmark: (id: string, name: string) => deps.service.renameBookmark(id, name),
    listBackups: (id: string, remote: string) => deps.service.listBackups(id, remote),
    restoreBackup: (id: string, remote: string, ts?: Date) =>
      deps.service.restoreBackup(id, remote, ts ? new Date(ts) : undefined),
    listKnownHosts: (): KnownHostEntry[] => deps.knownHosts.list(),
    removeKnownHost: (host: string, port: number) => deps.knownHosts.remove(host, port),

    // ---- local / dialogs ----
    isSecretStorageAvailable: (): boolean => deps.isSecretStorageAvailable(),
    listLocal: (dir: string) => deps.listLocal(dir),
    homeDir: (): string => deps.homeDir(),
    pickFile: () => deps.pickFile(),
    pickDirectory: () => deps.pickDirectory(),
    pickSavePath: (defaultName: string) => deps.pickSavePath(defaultName),
  };
}

export type IpcHandlers = ReturnType<typeof createIpcHandlers>;
