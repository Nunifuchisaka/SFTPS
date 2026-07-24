import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type FunabinFtpApi } from '../shared/ipc';

const api: FunabinFtpApi = {
  listProfiles: () => ipcRenderer.invoke(IPC.listProfiles),
  saveProfile: (input, options) => ipcRenderer.invoke(IPC.saveProfile, input, options),
  deleteProfile: (id, options) => ipcRenderer.invoke(IPC.deleteProfile, id, options),
  getProfileDefaults: () => ipcRenderer.invoke(IPC.getProfileDefaults),
  listProfileFolders: () => ipcRenderer.invoke(IPC.listProfileFolders),
  saveProfileFolder: (input) => ipcRenderer.invoke(IPC.saveProfileFolder, input),
  deleteProfileFolder: (id) => ipcRenderer.invoke(IPC.deleteProfileFolder, id),
  reorderProfileFolders: (id, targetIndex) =>
    ipcRenderer.invoke(IPC.reorderProfileFolders, id, targetIndex),
  moveProfile: (profileId, targetFolderId, targetIndex) =>
    ipcRenderer.invoke(IPC.moveProfile, profileId, targetFolderId, targetIndex),
  testConnection: (id) => ipcRenderer.invoke(IPC.testConnection, id),
  listRemote: (id, remoteDir) => ipcRenderer.invoke(IPC.listRemote, id, remoteDir),
  prepareUpload: (id, localPath, remotePath) =>
    ipcRenderer.invoke(IPC.prepareUpload, id, localPath, remotePath),
  commitUpload: (id, localPath, remotePath, options) =>
    ipcRenderer.invoke(IPC.commitUpload, id, localPath, remotePath, options),
  prepareSync: (id, localDir, remoteDir, options) =>
    ipcRenderer.invoke(IPC.prepareSync, id, localDir, remoteDir, options),
  commitSync: (id, localDir, remoteDir, options) =>
    ipcRenderer.invoke(IPC.commitSync, id, localDir, remoteDir, options),
  enqueueTransfer: (request) => ipcRenderer.invoke(IPC.enqueueTransfer, request),
  queueStatus: () => ipcRenderer.invoke(IPC.queueStatus),
  cancelAllTasks: () => ipcRenderer.invoke(IPC.cancelAllTasks),
  clearCompletedTasks: () => ipcRenderer.invoke(IPC.clearCompletedTasks),
  prepareDownload: (id, remotePath, savePath) =>
    ipcRenderer.invoke(IPC.prepareDownload, id, remotePath, savePath),
  download: (id, remotePath, savePath) =>
    ipcRenderer.invoke(IPC.download, id, remotePath, savePath),
  renameRemote: (id, from, to) => ipcRenderer.invoke(IPC.renameRemote, id, from, to),
  deleteRemote: (id, remotePath) => ipcRenderer.invoke(IPC.deleteRemote, id, remotePath),
  chmodRemote: (id, remotePath, mode) => ipcRenderer.invoke(IPC.chmodRemote, id, remotePath, mode),
  historyList: (filter) => ipcRenderer.invoke(IPC.historyList, filter),
  historyClear: () => ipcRenderer.invoke(IPC.historyClear),
  listBookmarks: (profileId) => ipcRenderer.invoke(IPC.listBookmarks, profileId),
  addBookmark: (input) => ipcRenderer.invoke(IPC.addBookmark, input),
  removeBookmark: (id) => ipcRenderer.invoke(IPC.removeBookmark, id),
  renameBookmark: (id, name) => ipcRenderer.invoke(IPC.renameBookmark, id, name),
  listBackups: (id, remotePath) => ipcRenderer.invoke(IPC.listBackups, id, remotePath),
  restoreBackup: (id, remotePath, timestamp) =>
    ipcRenderer.invoke(IPC.restoreBackup, id, remotePath, timestamp),
  listKnownHosts: () => ipcRenderer.invoke(IPC.listKnownHosts),
  removeKnownHost: (host, port) => ipcRenderer.invoke(IPC.removeKnownHost, host, port),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),
  isSecretStorageAvailable: () => ipcRenderer.invoke(IPC.isSecretStorageAvailable),
  listLocal: (dir) => ipcRenderer.invoke(IPC.listLocal, dir),
  isDirectory: (p) => ipcRenderer.invoke(IPC.isDirectory, p),
  homeDir: () => ipcRenderer.invoke(IPC.homeDir),
  pickFile: () => ipcRenderer.invoke(IPC.pickFile),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  pickSavePath: (defaultName) => ipcRenderer.invoke(IPC.pickSavePath, defaultName),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  prepareReleaseDiff: (localDir) => ipcRenderer.invoke(IPC.prepareReleaseDiff, localDir),
  createReleaseZip: (repoRoot, files, savePath) =>
    ipcRenderer.invoke(IPC.createReleaseZip, repoRoot, files, savePath),
};

contextBridge.exposeInMainWorld('api', api);
