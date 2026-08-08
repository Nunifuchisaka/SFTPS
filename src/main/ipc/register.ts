import { ipcMain, type IpcMainInvokeEvent } from 'electron';
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
import { ipcSchemas } from './schemas';

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
export interface RegisterIpcOptions {
  isTrustedSender(event: IpcMainInvokeEvent): boolean;
}

export function registerIpc(deps: IpcHandlerDeps, options: RegisterIpcOptions): IpcHandlers {
  const h = createIpcHandlers(deps);
  const handle = <TArgs extends unknown[], TResult>(
    channel: string,
    listener: (...args: TArgs) => TResult,
  ): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!options.isTrustedSender(event)) throw new Error('untrusted IPC sender');
      return listener(...(args as TArgs));
    });
  };

  handle(IPC.enqueueTransfer, (request: unknown) =>
    h.enqueueTransfer(ipcSchemas.transferRequest.parse(request) as TransferRequest),
  );
  handle(IPC.queueStatus, () => h.queueStatus());
  handle(IPC.cancelAllTasks, () => h.cancelAllTasks());
  handle(IPC.clearCompletedTasks, () => h.clearCompletedTasks());
  handle(IPC.historyList, (filter?: unknown) =>
    h.historyList(ipcSchemas.historyFilter.parse(filter) as HistoryFilter | undefined),
  );
  handle(IPC.historyClear, () => h.historyClear());

  handle(IPC.listProfiles, () => h.listProfiles());
  handle(IPC.saveProfile, (input: unknown, saveOptions?: unknown) =>
    h.saveProfile(
      ipcSchemas.profile.parse(input) as Profile,
      ipcSchemas.saveProfileOptions.parse(saveOptions) as SaveProfileOptions | undefined,
    ),
  );
  handle(IPC.deleteProfile, (id: unknown, deleteOptions?: unknown) =>
    h.deleteProfile(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.deleteProfileOptions.parse(deleteOptions) as DeleteProfileOptions | undefined,
    ),
  );
  handle(IPC.getProfileDefaults, () => h.getProfileDefaults());
  handle(IPC.getSettings, () => h.getSettings());
  handle(IPC.saveSettings, (settings: unknown) => h.saveSettings(settings));

  handle(IPC.testConnection, (id: unknown) => h.testConnection(ipcSchemas.profileId.parse(id)));
  handle(IPC.listRemote, (id: unknown, dir: unknown) =>
    h.listRemote(ipcSchemas.profileId.parse(id), ipcSchemas.remotePath.parse(dir)),
  );
  handle(IPC.prepareUpload, (id: unknown, local: unknown, remote: unknown) =>
    h.prepareUpload(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.localPath.parse(local),
      ipcSchemas.remotePath.parse(remote),
    ),
  );
  handle(
    IPC.commitUpload,
    (id: unknown, local: unknown, remote: unknown, commitOptions?: unknown) =>
      h.commitUpload(
        ipcSchemas.profileId.parse(id),
        ipcSchemas.localPath.parse(local),
        ipcSchemas.remotePath.parse(remote),
        ipcSchemas.commitOptions.parse(commitOptions),
      ),
  );
  handle(
    IPC.prepareSync,
    (id: unknown, localDir: unknown, remoteDir: unknown, syncOptions?: unknown) =>
      h.prepareSync(
        ipcSchemas.profileId.parse(id),
        ipcSchemas.localPath.parse(localDir),
        ipcSchemas.remotePath.parse(remoteDir),
        ipcSchemas.syncOptions.parse(syncOptions) as SyncFolderOptions | undefined,
      ),
  );
  handle(
    IPC.commitSync,
    (id: unknown, localDir: unknown, remoteDir: unknown, syncOptions?: unknown) =>
      h.commitSync(
        ipcSchemas.profileId.parse(id),
        ipcSchemas.localPath.parse(localDir),
        ipcSchemas.remotePath.parse(remoteDir),
        ipcSchemas.syncOptions.parse(syncOptions) as SyncFolderOptions | undefined,
      ),
  );
  handle(IPC.prepareDownload, (id: unknown, remote: unknown, save: unknown) =>
    h.prepareDownload(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.remotePath.parse(remote),
      ipcSchemas.localPath.parse(save),
    ),
  );
  handle(IPC.download, (id: unknown, remote: unknown, save: unknown) =>
    h.download(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.remotePath.parse(remote),
      ipcSchemas.localPath.parse(save),
    ),
  );
  handle(IPC.renameRemote, (id: unknown, from: unknown, to: unknown) =>
    h.renameRemote(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.remotePath.parse(from),
      ipcSchemas.remotePath.parse(to),
    ),
  );
  handle(IPC.deleteRemote, (id: unknown, remote: unknown) =>
    h.deleteRemote(ipcSchemas.profileId.parse(id), ipcSchemas.remotePath.parse(remote)),
  );
  handle(IPC.chmodRemote, (id: unknown, remote: unknown, mode: unknown) =>
    h.chmodRemote(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.remotePath.parse(remote),
      ipcSchemas.mode.parse(mode),
    ),
  );

  handle(IPC.listBookmarks, (profileId?: unknown) =>
    h.listBookmarks(profileId === undefined ? undefined : ipcSchemas.profileId.parse(profileId)),
  );
  handle(IPC.addBookmark, (input: unknown) =>
    h.addBookmark(ipcSchemas.bookmark.parse(input) as BookmarkInput),
  );
  handle(IPC.removeBookmark, (id: unknown) => h.removeBookmark(ipcSchemas.shortText.parse(id)));
  handle(IPC.renameBookmark, (id: unknown, name: unknown) =>
    h.renameBookmark(ipcSchemas.shortText.parse(id), ipcSchemas.shortText.parse(name)),
  );
  handle(IPC.listBackups, (id: unknown, remote: unknown) =>
    h.listBackups(ipcSchemas.profileId.parse(id), ipcSchemas.remotePath.parse(remote)),
  );
  handle(IPC.restoreBackup, (id: unknown, remote: unknown, ts?: unknown) =>
    h.restoreBackup(
      ipcSchemas.profileId.parse(id),
      ipcSchemas.remotePath.parse(remote),
      ts === undefined ? undefined : ipcSchemas.timestamp.parse(ts),
    ),
  );
  handle(IPC.listKnownHosts, () => h.listKnownHosts());
  handle(IPC.removeKnownHost, (host: unknown, port: unknown) =>
    h.removeKnownHost(ipcSchemas.host.parse(host), ipcSchemas.port.parse(port)),
  );

  handle(IPC.isSecretStorageAvailable, () => h.isSecretStorageAvailable());
  handle(IPC.listLocal, (dir: unknown) => h.listLocal(ipcSchemas.localPath.parse(dir)));
  handle(IPC.isDirectory, (p: unknown) => h.isDirectory(ipcSchemas.localPath.parse(p)));
  handle(IPC.homeDir, () => h.homeDir());
  handle(IPC.pickFile, () => h.pickFile());
  handle(IPC.pickDirectory, () => h.pickDirectory());
  handle(IPC.pickSavePath, (defaultName: unknown) =>
    h.pickSavePath(ipcSchemas.shortText.parse(defaultName)),
  );

  handle(IPC.prepareReleaseDiff, (localDir: unknown) =>
    h.prepareReleaseDiff(ipcSchemas.localPath.parse(localDir)),
  );
  handle(IPC.createReleaseZip, (repoRoot: unknown, files: unknown, savePath: unknown) =>
    h.createReleaseZip(
      ipcSchemas.localPath.parse(repoRoot),
      ipcSchemas.stringArray.parse(files),
      ipcSchemas.localPath.parse(savePath),
    ),
  );

  return h;
}
