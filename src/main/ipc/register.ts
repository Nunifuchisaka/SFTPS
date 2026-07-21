import { ipcMain, dialog, safeStorage } from 'electron';
import { homedir } from 'node:os';
import { IPC, type SyncFolderOptions, type TransferRequest } from '../../shared/ipc';
import type { Profile } from '../../core/profile/index';
import type { TransferQueue } from '../../core/queue/index';
import type { HistoryEntry, HistoryFilter, HistoryInput } from '../../core/history/index';
import type { AppService } from '../app-service';
import { listLocalDir } from '../local-fs';
import { taskToHistoryInput } from '../history-recorder';

/** 履歴の記録・参照口（永続化を内包）。 */
export interface HistoryController {
  append(input: HistoryInput): void;
  list(filter?: HistoryFilter): HistoryEntry[];
  clear(): void;
}

/** AppService のメソッドを ipcMain.handle に結線する。ここはロジックを持たない薄い層。 */
export function registerIpc(
  service: AppService,
  queue: TransferQueue,
  history: HistoryController,
): void {
  let seq = 0;
  const genId = (): string => `op${Date.now()}-${seq++}`;
  const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  // キューは run() 実行中に新規タスクを拾わないため、投入のたびに
  // 「未処理が無くなるまで run を回す」ドライバで駆動する。
  // 完走後、終端タスクを id 重複排除して一度だけ履歴へ記録する（リトライ中の中間失敗を残さない）。
  let draining = false;
  const recorded = new Set<string>();
  const drive = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      while (queue.list().some((t) => t.status === 'queued')) {
        await queue.run();
      }
    } finally {
      draining = false;
      for (const task of queue.list()) {
        if ((task.status === 'succeeded' || task.status === 'failed') && !recorded.has(task.id)) {
          recorded.add(task.id);
          const input = taskToHistoryInput(task);
          if (input) history.append(input);
        }
      }
    }
  };

  ipcMain.handle(IPC.enqueueTransfer, (_e, request: TransferRequest) => {
    const id = `t${Date.now()}-${seq++}`;
    queue.add({ id, kind: request.kind, label: request.label, payload: request });
    void drive();
    return id;
  });
  ipcMain.handle(IPC.queueStatus, () => ({ tasks: queue.list(), overall: queue.overall() }));
  ipcMain.handle(IPC.cancelAllTasks, () => queue.cancelAll());
  ipcMain.handle(IPC.historyList, (_e, filter?: HistoryFilter) => history.list(filter));
  ipcMain.handle(IPC.historyClear, () => history.clear());

  ipcMain.handle(IPC.listProfiles, () => service.listProfiles());
  ipcMain.handle(IPC.saveProfile, (_e, input: Profile) => service.saveProfile(input));
  ipcMain.handle(IPC.deleteProfile, (_e, id: string) => service.deleteProfile(id));
  ipcMain.handle(IPC.testConnection, (_e, id: string) => service.testConnection(id));
  ipcMain.handle(IPC.listRemote, (_e, id: string, dir: string) => service.listRemote(id, dir));
  ipcMain.handle(IPC.prepareUpload, (_e, id: string, local: string, remote: string) =>
    service.prepareUpload(id, local, remote),
  );
  ipcMain.handle(
    IPC.commitUpload,
    (_e, id: string, local: string, remote: string, options?: { verifyAfterTransfer?: boolean }) =>
      service.commitUpload(id, local, remote, options),
  );
  ipcMain.handle(
    IPC.prepareSync,
    (_e, id: string, localDir: string, remoteDir: string, options?: SyncFolderOptions) =>
      service.prepareSync(id, localDir, remoteDir, options),
  );
  ipcMain.handle(
    IPC.commitSync,
    (_e, id: string, localDir: string, remoteDir: string, options?: SyncFolderOptions) =>
      service.commitSync(id, localDir, remoteDir, options),
  );
  ipcMain.handle(IPC.prepareDownload, (_e, id: string, remote: string, save: string) =>
    service.prepareDownload(id, remote, save),
  );
  ipcMain.handle(IPC.download, (_e, id: string, remote: string, save: string) =>
    service.download(id, remote, save),
  );
  ipcMain.handle(IPC.renameRemote, async (_e, id: string, from: string, to: string) => {
    try {
      await service.renameRemote(id, from, to);
      history.append({ id: genId(), kind: 'rename', profileId: id, path: to, status: 'success' });
    } catch (err) {
      history.append({
        id: genId(),
        kind: 'rename',
        profileId: id,
        path: from,
        status: 'failed',
        error: errorMessage(err),
      });
      throw err;
    }
  });
  ipcMain.handle(IPC.deleteRemote, async (_e, id: string, remote: string) => {
    try {
      await service.deleteRemote(id, remote);
      history.append({ id: genId(), kind: 'delete', profileId: id, path: remote, status: 'success' });
    } catch (err) {
      history.append({
        id: genId(),
        kind: 'delete',
        profileId: id,
        path: remote,
        status: 'failed',
        error: errorMessage(err),
      });
      throw err;
    }
  });
  ipcMain.handle(IPC.chmodRemote, async (_e, id: string, remote: string, mode: number) => {
    try {
      await service.chmodRemote(id, remote, mode);
      history.append({ id: genId(), kind: 'chmod', profileId: id, path: remote, status: 'success' });
    } catch (err) {
      history.append({
        id: genId(),
        kind: 'chmod',
        profileId: id,
        path: remote,
        status: 'failed',
        error: errorMessage(err),
      });
      throw err;
    }
  });
  ipcMain.handle(IPC.listBackups, (_e, id: string, remote: string) =>
    service.listBackups(id, remote),
  );
  ipcMain.handle(IPC.restoreBackup, (_e, id: string, remote: string, ts?: Date) =>
    service.restoreBackup(id, remote, ts ? new Date(ts) : undefined),
  );
  ipcMain.handle(IPC.isSecretStorageAvailable, () => safeStorage.isEncryptionAvailable());
  ipcMain.handle(IPC.listLocal, (_e, dir: string) => listLocalDir(dir));
  ipcMain.handle(IPC.homeDir, () => homedir());

  ipcMain.handle(IPC.pickFile, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  ipcMain.handle(IPC.pickDirectory, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  ipcMain.handle(IPC.pickSavePath, async (_e, defaultName: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: defaultName });
    return result.canceled || !result.filePath ? null : result.filePath;
  });
}
