import { app, BrowserWindow, dialog, safeStorage } from 'electron';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BackupManager } from '../core/backup/index';
import {
  buildHostKeyPrompt,
  createHostVerifier,
  isPromptConsent,
  sha256Fingerprint,
} from '../core/hostkey/index';
import { isAllowedNavigation, type NavigationPolicy } from '../core/security/index';
import { createTranslator, dictionaries, LOCALES, resolveLocale } from '../core/i18n/index';
import { AppService } from './app-service';
import { ProfileStore } from './profile-store';
import { SecretStore } from './secret-store';
import { createTransport, defaultTransportDeps, type TransportFactoryDeps } from './transport-factory';
import { KnownHostsFile, KnownHostsLoadError } from './known-hosts-store';
import { KnownHostsController } from './known-hosts-controller';
import { createAppTransferQueue } from './transfer-queue-factory';
import { HistoryFile } from './history-store';
import { BookmarkFile } from './bookmark-store';
import { SettingsFile } from './settings-store';
import { SettingsController } from './settings-controller';
import { TerminalTaskRecorder } from './history-recorder';
import { listLocalDir } from './local-fs';
import { registerIpc, type HistoryController } from './ipc/register';
import type { HistoryStore, HistoryFilter, HistoryInput } from '../core/history/index';
import type { AppSettings } from '../core/settings/index';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** メインプロセス側の文言は OS のロケールから引く（レンダラの選択は localStorage 側）。 */
function createMainTranslator(): Translate {
  return createTranslator(dictionaries, resolveLocale(app.getLocale(), LOCALES, 'ja'));
}

/** 永続化の失敗を握り潰さず、ログとダイアログの両方に出す。 */
function reportStoreError(t: Translate, file: string, err: unknown): void {
  console.error(`[sftps] failed to persist ${file}:`, err);
  dialog.showErrorBox(t('store.saveFailed', { file }), err instanceof Error ? err.message : String(err));
}

/** 復旧不能な起動時エラー。空データで続行せず終了する（フェイルクローズ）。 */
function fatal(t: Translate, file: string, err: unknown): never {
  console.error(`[sftps] fatal: cannot load ${file}:`, err);
  dialog.showErrorBox(t('store.loadFailed', { file }), err instanceof Error ? err.message : String(err));
  app.exit(1);
  throw err;
}

async function openKnownHosts(t: Translate): Promise<KnownHostsController> {
  const file = new KnownHostsFile(join(app.getPath('userData'), 'known_hosts.json'));
  try {
    return new KnownHostsController(file, await file.load());
  } catch (err) {
    // 破損・権限エラーを「信頼済みゼロ」として扱うとピン留めが実質バイパスされる。
    if (err instanceof KnownHostsLoadError) fatal(t, 'known_hosts.json', err.cause);
    throw err;
  }
}

interface ServiceParts {
  backupManager: BackupManager;
  history: MainHistoryController;
  settings: () => AppSettings;
}

function createService(
  t: Translate,
  knownHosts: KnownHostsController,
  parts: ServiceParts,
): AppService {
  const userData = app.getPath('userData');

  const deps: TransportFactoryDeps = {
    ...defaultTransportDeps,
    makeSftpHostVerifier: (profile) =>
      createHostVerifier({
        host: profile.host,
        port: profile.port,
        policy: profile.hostKeyPolicy ?? 'tofu',
        fingerprintOf: sha256Fingerprint,
        verify: (h, p, fp) => knownHosts.verify(h, p, fp),
        knownFingerprintOf: (h, p) => knownHosts.lookup(h, p),
        // 未知の鍵は SHA256 指紋を提示し、明示同意を得るまで受理しない。
        confirm: (request) => askHostKey(t, request),
        onAccept: (h, p, fp) => {
          knownHosts.trust(h, p, fp).catch((err: unknown) => {
            reportStoreError(t, 'known_hosts.json', err);
          });
        },
        onReject: (request) => {
          if (request.verdict === 'mismatch') warnHostKeyMismatch(t, request);
        },
      }),
  };

  return new AppService({
    profileStore: new ProfileStore(join(userData, 'profiles.json')),
    secretStore: new SecretStore({ safeStorage, filePath: join(userData, 'secrets.json') }),
    backupManager: parts.backupManager,
    bookmarkStore: new BookmarkFile(join(userData, 'bookmarks.json')),
    createTransport: (profile, secrets) => createTransport(profile, secrets, deps),
    historyStore: parts.history,
    knownHosts,
    settings: parts.settings,
  });
}

type PromptRequest = Parameters<typeof buildHostKeyPrompt>[0];

function activeWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

/** ホスト鍵の指紋を提示して同意を取る（ssh2 の hostVerifier は非同期応答を受けられる）。 */
async function askHostKey(t: Translate, request: PromptRequest): Promise<boolean> {
  const content = buildHostKeyPrompt(request, t);
  const options = {
    type: 'warning' as const,
    title: content.title,
    message: content.message,
    detail: content.detail,
    buttons: content.buttons,
    defaultId: content.defaultId,
    cancelId: content.cancelId,
    noLink: true,
  };
  const win = activeWindow();
  const result = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return isPromptConsent(content, result.response);
}

/** 鍵不一致（MITM の疑い）は受理せず、記録済み指紋と併せて警告する。 */
function warnHostKeyMismatch(t: Translate, request: PromptRequest): void {
  const content = buildHostKeyPrompt(request, t);
  dialog.showErrorBox(content.message, content.detail);
}

/** IPC 用の履歴口に、プロファイル削除時の掃除（removeByProfile）を足したもの。 */
interface MainHistoryController extends HistoryController {
  removeByProfile(profileId: string): number;
}

async function createHistoryController(t: Translate): Promise<MainHistoryController> {
  const historyFile = new HistoryFile(join(app.getPath('userData'), 'history.json'));
  const history: HistoryStore = await historyFile.load();
  const save = (): void => {
    historyFile.save(history).catch((err: unknown) => reportStoreError(t, 'history.json', err));
  };
  return {
    append: (input: HistoryInput) => {
      history.append(input);
      save();
    },
    list: (filter?: HistoryFilter) => history.list(filter),
    clear: () => {
      history.clear();
      save();
    },
    removeByProfile: (profileId: string) => {
      const removed = history.removeByProfile(profileId);
      if (removed > 0) save();
      return removed;
    },
  };
}

function navigationPolicy(): NavigationPolicy {
  return {
    appUrl: pathToFileURL(join(app.getAppPath(), 'out/renderer/index.html')).toString(),
    devServerUrl: process.env['ELECTRON_RENDERER_URL'] ?? null,
  };
}

/** レンダラに生えた window.api を外部 origin へ渡さないため、遷移と新規ウィンドウを既定拒否する。 */
function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url, navigationPolicy())) {
        event.preventDefault();
        console.warn(`[sftps] blocked navigation to ${url}`);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      console.warn(`[sftps] blocked window.open to ${url}`);
      return { action: 'deny' };
    });
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    title: 'SFTPS',
    webPreferences: {
      // プリロードは CJS(.cjs) で出力する。sandbox: true のレンダラでは ESM プリロードを読めないため。
      preload: join(app.getAppPath(), 'out/preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(app.getAppPath(), 'out/renderer/index.html'));
  }
}

/** 永続層・サービス・キュー・IPC を組み立てて画面を開く。 */
async function boot(): Promise<void> {
  const t = createMainTranslator();
  const userData = app.getPath('userData');
  const knownHosts = await openKnownHosts(t);
  const history = await createHistoryController(t);

  const settingsFile = new SettingsFile(join(userData, 'settings.json'));
  const initial = await settingsFile.load();
  const backupManager = new BackupManager({
    backupRoot: join(userData, 'backups'),
    maxGenerations: initial.backup.maxGenerations,
    maxAgeDays: initial.backup.maxAgeDays,
  });
  const settings = new SettingsController(settingsFile, initial, (next) => {
    backupManager.setRetention(next.backup);
    // 保持期間を縮めた設定は、既存の（もう触られない）バックアップにも効かせる。
    backupManager.pruneExpired().catch((err: unknown) => reportStoreError(t, 'backups', err));
  });
  settings.applyNow();

  const service = createService(t, knownHosts, {
    backupManager,
    history,
    settings: () => settings.get(),
  });
  // 終端タスクの履歴記録はキューの保持上限より先に走らせる（破棄前に記録する）。
  const recorder = new TerminalTaskRecorder((input) => history.append(input));
  const queue = createAppTransferQueue(service, {
    onEvict: (tasks) => void recorder.record(tasks),
  });

  registerIpc({
    service,
    queue,
    recorder,
    history,
    knownHosts,
    settings,
    listLocal: (dir) => listLocalDir(dir),
    homeDir: () => homedir(),
    isSecretStorageAvailable: () => safeStorage.isEncryptionAvailable(),
    pickFile: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openFile'] });
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
    pickSavePath: async (defaultName: string) => {
      const result = await dialog.showSaveDialog({ defaultPath: defaultName });
      return result.canceled || !result.filePath ? null : result.filePath;
    },
  });

  createWindow();
}

// 二重起動は後勝ちで永続ファイルを壊すため、常に単一インスタンスに閉じる。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = activeWindow();
    if (!win) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  hardenWebContents();

  void app.whenReady().then(async () => {
    await boot();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
