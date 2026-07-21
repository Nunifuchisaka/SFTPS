import { ipcMain } from 'electron';
import {
  IPC,
  type DeleteProfileOptions,
  type SaveProfileOptions,
  type SyncFolderOptions,
  type TransferRequest,
} from '../../shared/ipc';
import type { Profile } from '../../core/profile/index';
import type { HistoryFilter } from '../../core/history/index';
import type { BookmarkInput } from '../../core/bookmark/index';
import { createIpcHandlers, type IpcHandlerDeps, type IpcHandlers } from './handlers';

export type {
  HistoryController,
  IpcHandlerDeps,
  IpcHandlers,
  IpcQueue,
  IpcService,
  KnownHostsApi,
  SettingsApi,
} from './handlers';

/**
 * ハンドラ（createIpcHandlers）を ipcMain.handle へ結線するだけの層。
 * ここにはロジックを置かない（置くとテストできなくなる）。
 */
export function registerIpc(deps: IpcHandlerDeps): IpcHandlers {
  const h = createIpcHandlers(deps);

  ipcMain.handle(IPC.enqueueTransfer, (_e, request: TransferRequest) => h.enqueueTransfer(request));
  ipcMain.handle(IPC.queueStatus, () => h.queueStatus());
  ipcMain.handle(IPC.cancelAllTasks, () => h.cancelAllTasks());
  ipcMain.handle(IPC.clearCompletedTasks, () => h.clearCompletedTasks());
  ipcMain.handle(IPC.historyList, (_e, filter?: HistoryFilter) => h.historyList(filter));
  ipcMain.handle(IPC.historyClear, () => h.historyClear());

  ipcMain.handle(IPC.listProfiles, () => h.listProfiles());
  ipcMain.handle(IPC.saveProfile, (_e, input: Profile, options?: SaveProfileOptions) =>
    h.saveProfile(input, options),
  );
  ipcMain.handle(IPC.deleteProfile, (_e, id: string, options?: DeleteProfileOptions) =>
    h.deleteProfile(id, options),
  );
  ipcMain.handle(IPC.getSettings, () => h.getSettings());
  ipcMain.handle(IPC.saveSettings, (_e, settings: unknown) => h.saveSettings(settings));

  ipcMain.handle(IPC.testConnection, (_e, id: string) => h.testConnection(id));
  ipcMain.handle(IPC.listRemote, (_e, id: string, dir: string) => h.listRemote(id, dir));
  ipcMain.handle(IPC.prepareUpload, (_e, id: string, local: string, remote: string) =>
    h.prepareUpload(id, local, remote),
  );
  ipcMain.handle(
    IPC.commitUpload,
    (_e, id: string, local: string, remote: string, options?: { verifyAfterTransfer?: boolean }) =>
      h.commitUpload(id, local, remote, options),
  );
  ipcMain.handle(
    IPC.prepareSync,
    (_e, id: string, localDir: string, remoteDir: string, options?: SyncFolderOptions) =>
      h.prepareSync(id, localDir, remoteDir, options),
  );
  ipcMain.handle(
    IPC.commitSync,
    (_e, id: string, localDir: string, remoteDir: string, options?: SyncFolderOptions) =>
      h.commitSync(id, localDir, remoteDir, options),
  );
  ipcMain.handle(IPC.prepareDownload, (_e, id: string, remote: string, save: string) =>
    h.prepareDownload(id, remote, save),
  );
  ipcMain.handle(IPC.download, (_e, id: string, remote: string, save: string) =>
    h.download(id, remote, save),
  );
  ipcMain.handle(IPC.renameRemote, (_e, id: string, from: string, to: string) =>
    h.renameRemote(id, from, to),
  );
  ipcMain.handle(IPC.deleteRemote, (_e, id: string, remote: string) => h.deleteRemote(id, remote));
  ipcMain.handle(IPC.chmodRemote, (_e, id: string, remote: string, mode: number) =>
    h.chmodRemote(id, remote, mode),
  );

  ipcMain.handle(IPC.listBookmarks, (_e, profileId?: string) => h.listBookmarks(profileId));
  ipcMain.handle(IPC.addBookmark, (_e, input: BookmarkInput) => h.addBookmark(input));
  ipcMain.handle(IPC.removeBookmark, (_e, id: string) => h.removeBookmark(id));
  ipcMain.handle(IPC.renameBookmark, (_e, id: string, name: string) => h.renameBookmark(id, name));
  ipcMain.handle(IPC.listBackups, (_e, id: string, remote: string) => h.listBackups(id, remote));
  ipcMain.handle(IPC.restoreBackup, (_e, id: string, remote: string, ts?: Date) =>
    h.restoreBackup(id, remote, ts),
  );
  ipcMain.handle(IPC.listKnownHosts, () => h.listKnownHosts());
  ipcMain.handle(IPC.removeKnownHost, (_e, host: string, port: number) =>
    h.removeKnownHost(host, port),
  );

  ipcMain.handle(IPC.isSecretStorageAvailable, () => h.isSecretStorageAvailable());
  ipcMain.handle(IPC.listLocal, (_e, dir: string) => h.listLocal(dir));
  ipcMain.handle(IPC.homeDir, () => h.homeDir());
  ipcMain.handle(IPC.pickFile, () => h.pickFile());
  ipcMain.handle(IPC.pickDirectory, () => h.pickDirectory());
  ipcMain.handle(IPC.pickSavePath, (_e, defaultName: string) => h.pickSavePath(defaultName));

  return h;
}
