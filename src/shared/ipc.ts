import type { Profile, SecretKey } from '../core/profile/index';
import type { ProfileDefaults } from '../core/env/index';
import type { RemoteEntry } from '../core/transport/index';
import type { UploadPreview, CommitResult } from '../core/upload/index';
import type { DownloadPreview, DownloadResult } from '../core/download/index';
import type { BackupInfo } from '../core/backup/index';
import type { CompareBy, PlanSummary, RunSyncResult, SyncAction } from '../core/sync/index';
import type { OverallProgress, TransferTask } from '../core/queue/index';
import type { HistoryEntry, HistoryFilter } from '../core/history/index';
import type { Bookmark, BookmarkInput } from '../core/bookmark/index';
import type { KnownHostEntry } from '../core/hostkey/index';
import type { AppSettings } from '../core/settings/index';

export type { AppSettings, ProfileDefaults };

export interface DeleteProfileOptions {
  /** ブックマーク・履歴・ホスト鍵も削除するか（ユーザーの明示同意）。 */
  removeRelatedData?: boolean;
  /** バックアップも削除するか（復旧手段を失うため別途の明示同意）。 */
  removeBackups?: boolean;
}

export interface DeleteProfileResult {
  removedBookmarks: number;
  removedHistory: number;
  removedKnownHosts: number;
  purgedBackupNamespaces: number;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
}

export interface RestoreBackupResult {
  bytesWritten: number;
  /** 復元前に退避した現行リモート内容のバックアップパス。存在しなければ null。 */
  backupPath: string | null;
}

export interface SaveProfileOptions {
  /**
   * 明示的に削除するシークレット項目。
   * 空欄は「据え置き」であり削除ではないため、消去はこの明示指定でのみ行う。
   */
  clearSecrets?: SecretKey[];
}

/** キューへ投入する転送リクエスト（kind で判別）。 */
export type TransferRequest =
  | { kind: 'upload'; profileId: string; localPath: string; remotePath: string; label?: string }
  | { kind: 'download'; profileId: string; remotePath: string; savePath: string; label?: string }
  | {
      kind: 'sync';
      profileId: string;
      localDir: string;
      remoteDir: string;
      options?: SyncFolderOptions;
      label?: string;
    }
  | {
      kind: 'download-sync';
      profileId: string;
      remoteDir: string;
      localDir: string;
      options?: SyncFolderOptions;
      label?: string;
    };

export interface QueueStatus {
  tasks: TransferTask[];
  overall: OverallProgress;
}

export interface SyncFolderOptions {
  compareBy?: CompareBy;
  deleteExtraneous?: boolean;
  ignore?: string[];
}

export interface PrepareSyncResult {
  plan: SyncAction[];
  summary: PlanSummary;
}

export interface CommitSyncResult {
  result: RunSyncResult;
  summary: PlanSummary;
}

/** 差分納品ファイル抽出のプレビュー結果。 */
export interface PrepareReleaseDiffResult {
  /** 自動検出した git リポジトリのルート。 */
  repoRoot: string;
  /** ACMR（追加・コピー・変更・リネーム）対象。zip 化候補。 */
  files: string[];
  /** D（削除）対象。zip には含めず、リモート側の手動削除警告に使う。 */
  deletedFiles: string[];
}

/** zip 作成の実行結果。 */
export interface CreateReleaseZipResult {
  savePath: string;
  fileCount: number;
}

/** IPC チャンネル名。preload と main で共有する。 */
export const IPC = {
  listProfiles: 'profiles:list',
  saveProfile: 'profiles:save',
  deleteProfile: 'profiles:delete',
  getProfileDefaults: 'profiles:defaults',
  testConnection: 'conn:test',
  listRemote: 'remote:list',
  prepareUpload: 'upload:prepare',
  commitUpload: 'upload:commit',
  prepareSync: 'sync:prepare',
  commitSync: 'sync:commit',
  enqueueTransfer: 'queue:enqueue',
  queueStatus: 'queue:status',
  cancelAllTasks: 'queue:cancelAll',
  clearCompletedTasks: 'queue:clearCompleted',
  prepareDownload: 'remote:prepareDownload',
  download: 'remote:download',
  renameRemote: 'remote:rename',
  deleteRemote: 'remote:delete',
  chmodRemote: 'remote:chmod',
  historyList: 'history:list',
  historyClear: 'history:clear',
  listBookmarks: 'bookmark:list',
  addBookmark: 'bookmark:add',
  removeBookmark: 'bookmark:remove',
  renameBookmark: 'bookmark:rename',
  listBackups: 'backup:list',
  restoreBackup: 'backup:restore',
  listKnownHosts: 'hostkey:list',
  removeKnownHost: 'hostkey:remove',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  isSecretStorageAvailable: 'secret:available',
  listLocal: 'local:list',
  isDirectory: 'local:isDirectory',
  homeDir: 'local:home',
  pickFile: 'dialog:pickFile',
  pickDirectory: 'dialog:pickDir',
  pickSavePath: 'dialog:pickSave',
  prepareReleaseDiff: 'release:prepareDiff',
  createReleaseZip: 'release:createZip',
} as const;

/**
 * レンダラの window.api として公開される型付き API。
 * preload が実装し、main の ipcMain.handle が処理する。
 */
export interface FunabinFtpApi {
  listProfiles(): Promise<Profile[]>;
  saveProfile(input: Profile, options?: SaveProfileOptions): Promise<Profile>;
  /**
   * プロファイルを削除する。関連データ（ブックマーク・履歴・ホスト鍵）と
   * バックアップは、それぞれ options の明示指定がある場合のみ削除する。
   */
  deleteProfile(id: string, options?: DeleteProfileOptions): Promise<DeleteProfileResult>;
  /**
   * 開発用デフォルト値（.env、機密情報を含まない）。プロファイルが未存在の場合は null。
   * 新規作成フォームの初期値プリセットにのみ使う（保存は必ずユーザー操作経由）。
   */
  getProfileDefaults(): Promise<ProfileDefaults | null>;
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
  enqueueTransfer(request: TransferRequest): Promise<string>;
  queueStatus(): Promise<QueueStatus>;
  cancelAllTasks(): Promise<void>;
  /** 完了（成功/失敗/キャンセル）タスクをキューから破棄する。戻り値は破棄件数。 */
  clearCompletedTasks(): Promise<number>;
  prepareDownload(id: string, remotePath: string, savePath: string): Promise<DownloadPreview>;
  download(id: string, remotePath: string, savePath: string): Promise<DownloadResult>;
  renameRemote(id: string, from: string, to: string): Promise<void>;
  deleteRemote(id: string, remotePath: string): Promise<void>;
  chmodRemote(id: string, remotePath: string, mode: number): Promise<void>;
  historyList(filter?: HistoryFilter): Promise<HistoryEntry[]>;
  historyClear(): Promise<void>;
  listBookmarks(profileId?: string): Promise<Bookmark[]>;
  addBookmark(input: BookmarkInput): Promise<Bookmark>;
  removeBookmark(id: string): Promise<void>;
  renameBookmark(id: string, name: string): Promise<Bookmark>;
  listBackups(id: string, remotePath: string): Promise<BackupInfo[]>;
  restoreBackup(id: string, remotePath: string, timestamp?: Date): Promise<RestoreBackupResult>;
  /** 信頼済みホスト鍵の一覧（host:port と SHA256 指紋）。 */
  listKnownHosts(): Promise<KnownHostEntry[]>;
  /** 信頼済みホスト鍵を削除する。次回接続時に指紋の確認をやり直す。 */
  removeKnownHost(host: string, port: number): Promise<boolean>;
  /** アプリ設定（バックアップ保持ポリシー・差分プレビュー上限）を取得する。 */
  getSettings(): Promise<AppSettings>;
  /** アプリ設定を保存する。値は main 側で正規化され、保存後の値が返る。 */
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  isSecretStorageAvailable(): Promise<boolean>;
  listLocal(dir: string): Promise<RemoteEntry[]>;
  /** ローカルパスがディレクトリか判定する（D&Dのフォルダ/ファイル振り分け用）。 */
  isDirectory(path: string): Promise<boolean>;
  homeDir(): Promise<string>;
  pickFile(): Promise<string | null>;
  pickDirectory(): Promise<string | null>;
  pickSavePath(defaultName: string): Promise<string | null>;
  /** ドロップされた File の OS パスを取得する（preload の webUtils による同期呼び出し）。 */
  getPathForFile(file: File): string;
  /**
   * ローカルフォルダから git リポジトリルートを自動検出し、
   * main..HEAD の差分（ACMR対象/D対象）を取得する（差分納品ファイル抽出）。
   */
  prepareReleaseDiff(localDir: string): Promise<PrepareReleaseDiffResult>;
  /** 選択されたファイルだけを対象に `git archive HEAD` で zip を作成する。 */
  createReleaseZip(repoRoot: string, files: string[], savePath: string): Promise<CreateReleaseZipResult>;
}
