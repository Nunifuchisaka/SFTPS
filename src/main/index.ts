import { app, BrowserWindow, safeStorage } from 'electron';
import { join } from 'node:path';
import { BackupManager } from '../core/backup/index';
import { createHostVerifier, sha256Fingerprint } from '../core/hostkey/index';
import { AppService } from './app-service';
import { ProfileStore } from './profile-store';
import { SecretStore } from './secret-store';
import { createTransport, defaultTransportDeps, type TransportFactoryDeps } from './transport-factory';
import { KnownHostsFile } from './known-hosts-store';
import { createAppTransferQueue } from './transfer-queue-factory';
import { HistoryFile } from './history-store';
import { BookmarkFile } from './bookmark-store';
import { registerIpc, type HistoryController } from './ipc/register';
import type { HistoryFilter, HistoryInput } from '../core/history/index';

async function createService(): Promise<AppService> {
  const userData = app.getPath('userData');

  // ホスト鍵検証（known_hosts）: 起動時に読み込み、新規鍵受理時に追記保存する。
  const knownHostsFile = new KnownHostsFile(join(userData, 'known_hosts.json'));
  const knownHosts = await knownHostsFile.load();

  const deps: TransportFactoryDeps = {
    ...defaultTransportDeps,
    makeSftpHostVerifier: (profile) =>
      createHostVerifier({
        host: profile.host,
        port: profile.port,
        policy: profile.hostKeyPolicy ?? 'tofu',
        fingerprintOf: sha256Fingerprint,
        verify: (h, p, fp) => knownHosts.verify(h, p, fp),
        onAccept: (h, p, fp) => {
          knownHosts.add(h, p, fp);
          void knownHostsFile.save(knownHosts);
        },
      }),
  };

  return new AppService({
    profileStore: new ProfileStore(join(userData, 'profiles.json')),
    secretStore: new SecretStore({ safeStorage, filePath: join(userData, 'secrets.json') }),
    backupManager: new BackupManager({ backupRoot: join(userData, 'backups') }),
    bookmarkStore: new BookmarkFile(join(userData, 'bookmarks.json')),
    createTransport: (profile, secrets) => createTransport(profile, secrets, deps),
  });
}

async function createHistoryController(): Promise<HistoryController> {
  const userData = app.getPath('userData');
  const historyFile = new HistoryFile(join(userData, 'history.json'));
  const history = await historyFile.load();
  return {
    append: (input: HistoryInput) => {
      history.append(input);
      void historyFile.save(history);
    },
    list: (filter?: HistoryFilter) => history.list(filter),
    clear: () => {
      history.clear();
      void historyFile.save(history);
    },
  };
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    title: 'SFTPS',
    webPreferences: {
      preload: join(app.getAppPath(), 'out/preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(app.getAppPath(), 'out/renderer/index.html'));
  }
}

void app.whenReady().then(async () => {
  const service = await createService();
  const history = await createHistoryController();
  registerIpc(service, createAppTransferQueue(service), history);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
