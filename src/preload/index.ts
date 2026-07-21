import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type SftpsApi } from '../shared/ipc';

const api: SftpsApi = {
  listProfiles: () => ipcRenderer.invoke(IPC.listProfiles),
  saveProfile: (input) => ipcRenderer.invoke(IPC.saveProfile, input),
  deleteProfile: (id) => ipcRenderer.invoke(IPC.deleteProfile, id),
  testConnection: (id) => ipcRenderer.invoke(IPC.testConnection, id),
  listRemote: (id, remoteDir) => ipcRenderer.invoke(IPC.listRemote, id, remoteDir),
  prepareUpload: (id, localPath, remotePath) =>
    ipcRenderer.invoke(IPC.prepareUpload, id, localPath, remotePath),
  commitUpload: (id, localPath, remotePath) =>
    ipcRenderer.invoke(IPC.commitUpload, id, localPath, remotePath),
  prepareSync: (id, localDir, remoteDir, options) =>
    ipcRenderer.invoke(IPC.prepareSync, id, localDir, remoteDir, options),
  commitSync: (id, localDir, remoteDir, options) =>
    ipcRenderer.invoke(IPC.commitSync, id, localDir, remoteDir, options),
  enqueueTransfer: (request) => ipcRenderer.invoke(IPC.enqueueTransfer, request),
  queueStatus: () => ipcRenderer.invoke(IPC.queueStatus),
  cancelAllTasks: () => ipcRenderer.invoke(IPC.cancelAllTasks),
  prepareDownload: (id, remotePath, savePath) =>
    ipcRenderer.invoke(IPC.prepareDownload, id, remotePath, savePath),
  download: (id, remotePath, savePath) =>
    ipcRenderer.invoke(IPC.download, id, remotePath, savePath),
  renameRemote: (id, from, to) => ipcRenderer.invoke(IPC.renameRemote, id, from, to),
  deleteRemote: (id, remotePath) => ipcRenderer.invoke(IPC.deleteRemote, id, remotePath),
  chmodRemote: (id, remotePath, mode) => ipcRenderer.invoke(IPC.chmodRemote, id, remotePath, mode),
  listBackups: (id, remotePath) => ipcRenderer.invoke(IPC.listBackups, id, remotePath),
  restoreBackup: (id, remotePath, timestamp) =>
    ipcRenderer.invoke(IPC.restoreBackup, id, remotePath, timestamp),
  isSecretStorageAvailable: () => ipcRenderer.invoke(IPC.isSecretStorageAvailable),
  listLocal: (dir) => ipcRenderer.invoke(IPC.listLocal, dir),
  homeDir: () => ipcRenderer.invoke(IPC.homeDir),
  pickFile: () => ipcRenderer.invoke(IPC.pickFile),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  pickSavePath: (defaultName) => ipcRenderer.invoke(IPC.pickSavePath, defaultName),
  getPathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('api', api);
