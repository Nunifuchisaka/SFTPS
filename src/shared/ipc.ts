import type { Profile } from '../core/profile/index';
import type { RemoteEntry } from '../core/transport/index';
import type { UploadPreview, CommitResult } from '../core/upload/index';
import type { BackupInfo } from '../core/backup/index';
import type { CompareBy, PlanSummary, RunSyncResult, SyncAction } from '../core/sync/index';
import type { OverallProgress, TransferTask } from '../core/queue/index';

export interface ConnectionResult {
  ok: boolean;
  error?: string;
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

/** IPC チャンネル名。preload と main で共有する。 */
export const IPC = {
  listProfiles: 'profiles:list',
  saveProfile: 'profiles:save',
  deleteProfile: 'profiles:delete',
  testConnection: 'conn:test',
  listRemote: 'remote:list',
  prepareUpload: 'upload:prepare',
  commitUpload: 'upload:commit',
  prepareSync: 'sync:prepare',
  commitSync: 'sync:commit',
  enqueueTransfer: 'queue:enqueue',
  queueStatus: 'queue:status',
  cancelAllTasks: 'queue:cancelAll',
  download: 'remote:download',
  listBackups: 'backup:list',
  restoreBackup: 'backup:restore',
  isSecretStorageAvailable: 'secret:available',
  listLocal: 'local:list',
  homeDir: 'local:home',
  pickFile: 'dialog:pickFile',
  pickDirectory: 'dialog:pickDir',
  pickSavePath: 'dialog:pickSave',
} as const;

/**
 * レンダラの window.api として公開される型付き API。
 * preload が実装し、main の ipcMain.handle が処理する。
 */
export interface SftpsApi {
  listProfiles(): Promise<Profile[]>;
  saveProfile(input: Profile): Promise<Profile>;
  deleteProfile(id: string): Promise<void>;
  testConnection(id: string): Promise<ConnectionResult>;
  listRemote(id: string, remoteDir: string): Promise<RemoteEntry[]>;
  prepareUpload(id: string, localPath: string, remotePath: string): Promise<UploadPreview>;
  commitUpload(id: string, localPath: string, remotePath: string): Promise<CommitResult>;
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
  download(id: string, remotePath: string, savePath: string): Promise<{ bytesWritten: number }>;
  listBackups(id: string, remotePath: string): Promise<BackupInfo[]>;
  restoreBackup(id: string, remotePath: string, timestamp?: Date): Promise<{ bytesWritten: number }>;
  isSecretStorageAvailable(): Promise<boolean>;
  listLocal(dir: string): Promise<RemoteEntry[]>;
  homeDir(): Promise<string>;
  pickFile(): Promise<string | null>;
  pickDirectory(): Promise<string | null>;
  pickSavePath(defaultName: string): Promise<string | null>;
}
