import { app, BrowserWindow, dialog, safeStorage } from 'electron';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHostKeyPrompt, isPromptConsent } from '../core/hostkey/index';
import { isAllowedNavigation, type NavigationPolicy } from '../core/security/index';
import { createTranslator, dictionaries, LOCALES, resolveLocale } from '../core/i18n/index';
import { createAppServices } from './bootstrap';
import { KnownHostsLoadError } from './known-hosts-store';
import { createAppTransferQueue } from './transfer-queue-factory';
import { TerminalTaskRecorder } from './history-recorder';
import { listLocalDir, isLocalDirectory } from './local-fs';
import { prepareReleaseDiff, createReleaseZip } from './git-release';
import { registerIpc } from './ipc/register';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** メインプロセス側の文言は OS のロケールから引く（レンダラの選択は localStorage 側）。 */
function createMainTranslator(): Translate {
  return createTranslator(dictionaries, resolveLocale(app.getLocale(), LOCALES, 'ja'));
}

/** 永続化の失敗を握り潰さず、ログとダイアログの両方に出す。 */
function reportStoreError(t: Translate, file: string, err: unknown): void {
  console.error(`[funabinftp] failed to persist ${file}:`, err);
  dialog.showErrorBox(t('store.saveFailed', { file }), err instanceof Error ? err.message : String(err));
}

/** 復旧不能な起動時エラー。空データで続行せず終了する（フェイルクローズ）。 */
function fatal(t: Translate, file: string, err: unknown): never {
  console.error(`[funabinftp] fatal: cannot load ${file}:`, err);
  dialog.showErrorBox(t('store.loadFailed', { file }), err instanceof Error ? err.message : String(err));
  app.exit(1);
  throw err;
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
        console.warn(`[funabinftp] blocked navigation to ${url}`);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      console.warn(`[funabinftp] blocked window.open to ${url}`);
      return { action: 'deny' };
    });
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    title: 'FunabinFTP',
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

  let services: Awaited<ReturnType<typeof createAppServices>>;
  try {
    services = await createAppServices({
      userData: app.getPath('userData'),
      safeStorage,
      // 開発用デフォルト値（機密情報は含まない）。プロジェクトルートの .env（任意）から読む。
      appEnvPath: join(app.getAppPath(), '.env'),
      // 未知の鍵は SHA256 指紋を提示し、明示同意を得るまで受理しない。
      confirmHostKey: (request) => askHostKey(t, request),
      onHostKeyRejected: (request) => {
        if (request.verdict === 'mismatch') warnHostKeyMismatch(t, request);
      },
      reportStoreError: (file, err) => reportStoreError(t, file, err),
    });
  } catch (err) {
    // 破損・権限エラーを「信頼済みゼロ」として扱うとピン留めが実質バイパスされる。
    if (err instanceof KnownHostsLoadError) fatal(t, 'known_hosts.json', err.cause);
    throw err;
  }
  const { service, knownHosts, history, settings, profileDefaults } = services;

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
    isDirectory: (p) => isLocalDirectory(p),
    homeDir: () => homedir(),
    isSecretStorageAvailable: () => safeStorage.isEncryptionAvailable(),
    getProfileDefaults: () => profileDefaults,
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
    prepareReleaseDiff: (localDir: string) => prepareReleaseDiff(localDir),
    createReleaseZip: (repoRoot: string, files: string[], savePath: string) =>
      createReleaseZip(repoRoot, files, savePath),
  }, {
    isTrustedSender: (event) =>
      event.senderFrame === event.sender.mainFrame &&
      isAllowedNavigation(event.senderFrame.url, navigationPolicy()),
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
