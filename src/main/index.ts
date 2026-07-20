import { app, BrowserWindow, safeStorage } from 'electron';
import { join } from 'node:path';
import { BackupManager } from '../core/backup/index';
import { AppService } from './app-service';
import { ProfileStore } from './profile-store';
import { SecretStore } from './secret-store';
import { createTransport } from './transport-factory';
import { registerIpc } from './ipc/register';

function createService(): AppService {
  const userData = app.getPath('userData');
  return new AppService({
    profileStore: new ProfileStore(join(userData, 'profiles.json')),
    secretStore: new SecretStore({ safeStorage, filePath: join(userData, 'secrets.json') }),
    backupManager: new BackupManager({ backupRoot: join(userData, 'backups') }),
    createTransport: (profile, secrets) => createTransport(profile, secrets),
  });
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

void app.whenReady().then(() => {
  registerIpc(createService());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
