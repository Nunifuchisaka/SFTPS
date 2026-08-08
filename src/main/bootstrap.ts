import { join } from 'node:path';
import { BackupManager } from '../core/backup/index';
import {
  createHostVerifier,
  sha256Fingerprint,
  type HostKeyPromptRequest,
  type HostKeyVerdict,
  type HostVerifierFn,
} from '../core/hostkey/index';
import type { SftpProfile } from '../core/profile/index';
import type { ProfileDefaults } from '../core/env/index';
import type { HistoryStore, HistoryFilter, HistoryInput } from '../core/history/index';
import { AppService } from './app-service';
import { ProfileStore } from './profile-store';
import { SecretStore, type SafeStorageLike } from './secret-store';
import { createTransport, defaultTransportDeps, type TransportFactoryDeps } from './transport-factory';
import { KnownHostsFile } from './known-hosts-store';
import { KnownHostsController } from './known-hosts-controller';
import { HistoryFile } from './history-store';
import { BookmarkFile } from './bookmark-store';
import { SettingsFile } from './settings-store';
import { SettingsController } from './settings-controller';
import { loadProfileDefaults } from './dev-defaults';
import type { HistoryController } from './ipc/register';

/** IPC 用の履歴口に、プロファイル削除時の掃除（removeByProfile）を足したもの。 */
export interface MainHistoryController extends HistoryController {
  removeByProfile(profileId: string): number;
  /** 予約済みの履歴保存が完了するまで待つ（終了処理・テスト用）。 */
  flush(): Promise<void>;
}

/** ホスト鍵の検証・記録に必要な最小の構造型（KnownHostsController のサブセット）。 */
export interface HostKeyGateway {
  verify(host: string, port: number, fingerprint: string): HostKeyVerdict;
  lookup(host: string, port: number): string | null;
  trust(host: string, port: number, fingerprint: string): Promise<void>;
}

export interface BootstrapDeps {
  /** 永続化ファイルの保存先ディレクトリ（通常 app.getPath('userData')）。 */
  userData: string;
  safeStorage: SafeStorageLike;
  /** 開発用デフォルト値を読む .env の絶対パス。GUI 以外（MCP）は null で無効化する。 */
  appEnvPath: string | null;
  /**
   * 未知ホスト鍵の確認。GUI は指紋確認ダイアログを渡す。
   * 未指定の場合は同意なしとみなす（createHostVerifier 既存のフェイルクローズ仕様どおり）。
   */
  confirmHostKey?: (request: HostKeyPromptRequest) => Promise<boolean>;
  /**
   * ホスト鍵拒否の通知。GUI は mismatch 時のみ警告ダイアログを出す等、
   * verdict に応じたフィルタリングは呼び出し側の実装に委ねる（ここでは素通しする）。
   */
  onHostKeyRejected?: (request: HostKeyPromptRequest) => void;
  /** 永続化書き込み失敗の通知（既定は console.error のみ）。 */
  reportStoreError?: (file: string, err: unknown) => void;
}

export interface AppServices {
  service: AppService;
  knownHosts: KnownHostsController;
  history: MainHistoryController;
  settings: SettingsController;
  backupManager: BackupManager;
  profileDefaults: ProfileDefaults | null;
}

function defaultReportStoreError(file: string, err: unknown): void {
  console.error(`[funabinftp] failed to persist ${file}:`, err);
}

async function createHistoryController(
  filePath: string,
  reportStoreError: (file: string, err: unknown) => void,
): Promise<MainHistoryController> {
  const historyFile = new HistoryFile(filePath);
  const history: HistoryStore = await historyFile.load();
  let saveTail: Promise<void> = Promise.resolve();
  const save = (): void => {
    saveTail = saveTail
      .then(() => historyFile.save(history))
      .catch((err: unknown) => reportStoreError('history.json', err));
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
    flush: async () => saveTail,
  };
}

/**
 * SFTP のホスト鍵検証関数を組み立てるファクトリを作る純粋関数。
 * confirmHostKey 未指定時は同意なしとみなす（フェイルクローズ）。
 * createAppServices から独立して呼べるようにし、単体テストを容易にする。
 */
export function createSftpHostVerifierFactory(
  deps: Pick<BootstrapDeps, 'confirmHostKey' | 'onHostKeyRejected'>,
  knownHosts: HostKeyGateway,
  reportStoreError: (file: string, err: unknown) => void = defaultReportStoreError,
): (profile: SftpProfile) => HostVerifierFn {
  return (profile) =>
    createHostVerifier({
      host: profile.host,
      port: profile.port,
      policy: profile.hostKeyPolicy ?? 'tofu',
      fingerprintOf: sha256Fingerprint,
      verify: (h, p, fp) => knownHosts.verify(h, p, fp),
      knownFingerprintOf: (h, p) => knownHosts.lookup(h, p),
      confirm: deps.confirmHostKey,
      onAccept: (h, p, fp) => {
        knownHosts.trust(h, p, fp).catch((err: unknown) => reportStoreError('known_hosts.json', err));
      },
      onReject: deps.onHostKeyRejected,
    });
}

/**
 * GUI / MCP サーバー共通の DI 組み立て。
 * createWindow・IPC 登録・ダイアログ配線は行わない（それぞれ main/index.ts と
 * mcp-server/index.ts の責務）。
 * known_hosts.json の読み込み失敗（破損・権限エラー）は KnownHostsLoadError のまま
 * 呼び出し側へ伝播させる（フェイルクローズ。空データで続行しない）。
 */
export async function createAppServices(deps: BootstrapDeps): Promise<AppServices> {
  const reportStoreError = deps.reportStoreError ?? defaultReportStoreError;
  const userData = deps.userData;

  const knownHostsFile = new KnownHostsFile(join(userData, 'known_hosts.json'));
  const knownHosts = new KnownHostsController(knownHostsFile, await knownHostsFile.load());

  const history = await createHistoryController(join(userData, 'history.json'), reportStoreError);
  const profileDefaults = deps.appEnvPath ? await loadProfileDefaults(deps.appEnvPath) : null;

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
    backupManager.pruneExpired().catch((err: unknown) => reportStoreError('backups', err));
  });
  settings.applyNow();

  const transportDeps: TransportFactoryDeps = {
    ...defaultTransportDeps,
    makeSftpHostVerifier: createSftpHostVerifierFactory(deps, knownHosts, reportStoreError),
  };

  const service = new AppService({
    profileStore: new ProfileStore(join(userData, 'profiles.json')),
    secretStore: new SecretStore({ safeStorage: deps.safeStorage, filePath: join(userData, 'secrets.json') }),
    backupManager,
    bookmarkStore: new BookmarkFile(join(userData, 'bookmarks.json')),
    createTransport: (profile, secrets) => createTransport(profile, secrets, transportDeps),
    historyStore: history,
    knownHosts,
    settings: () => settings.get(),
  });

  return { service, knownHosts, history, settings, backupManager, profileDefaults };
}
