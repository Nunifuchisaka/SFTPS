import path from 'node:path';
import { LocalTransport, type RemoteEntry, type RemoteTransport } from '../core/transport/index';
import type { BackupInfo, BackupManager } from '../core/backup/index';
import { walkTree, planSync, summarizePlan, runSync, type SyncEntry } from '../core/sync/index';
import {
  extractSecrets,
  stripSecrets,
  validateProfile,
  type Profile,
} from '../core/profile/index';
import {
  prepareUpload as corePrepareUpload,
  commitUpload as coreCommitUpload,
  type CommitResult,
  type UploadPreview,
} from '../core/upload/index';
import {
  prepareDownload as corePrepareDownload,
  commitDownload as coreCommitDownload,
  type DownloadPreview,
  type DownloadResult,
} from '../core/download/index';
import type { SecretStore } from './secret-store';
import type { ProfileStore } from './profile-store';
import type { Secrets } from './transport-factory';
import type {
  ConnectionResult,
  SyncFolderOptions,
  PrepareSyncResult,
  CommitSyncResult,
} from '../shared/ipc';

export interface AppServiceDeps {
  profileStore: ProfileStore;
  secretStore: SecretStore;
  backupManager: BackupManager;
  createTransport: (profile: Profile, secrets: Secrets) => RemoteTransport;
}

/**
 * IPC ハンドラの中身となる純粋なアプリケーションサービス。
 * Electron / ipcMain には依存せず、単体テスト可能な形で全機能を提供する。
 */
export class AppService {
  constructor(private readonly deps: AppServiceDeps) {}

  async listProfiles(): Promise<Profile[]> {
    return this.deps.profileStore.list();
  }

  /**
   * プロファイルを保存する。シークレットは SecretStore へ分離し、
   * プロファイル JSON には決して平文で書かない。
   * シークレットがあるのに暗号化が使えない場合は保存を拒否する（例外）。
   */
  async saveProfile(input: Profile): Promise<Profile> {
    const errors = validateProfile(input);
    if (errors.length > 0) {
      throw new Error(`invalid profile: ${errors.join(', ')}`);
    }

    const secrets = extractSecrets(input);
    if (Object.keys(secrets).length > 0) {
      // 暗号化が使えなければここで例外 → プロファイルは永続化されない。
      await this.deps.secretStore.setSecrets(input.id, secrets);
    }

    const stripped = stripSecrets(input);
    const profiles = await this.deps.profileStore.list();
    const next = profiles.filter((p) => p.id !== input.id);
    next.push(stripped);
    await this.deps.profileStore.saveAll(next);
    return stripped;
  }

  async deleteProfile(id: string): Promise<void> {
    const profiles = await this.deps.profileStore.list();
    await this.deps.profileStore.saveAll(profiles.filter((p) => p.id !== id));
    await this.deps.secretStore.deleteSecrets(id);
  }

  async testConnection(id: string): Promise<ConnectionResult> {
    try {
      await this.withTransport(id, async () => undefined);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listRemote(id: string, remoteDir: string): Promise<RemoteEntry[]> {
    return this.withTransport(id, (transport) => transport.list(remoteDir));
  }

  async prepareUpload(id: string, localPath: string, remotePath: string): Promise<UploadPreview> {
    return this.withTransport(id, (transport) =>
      corePrepareUpload(transport, localPath, remotePath),
    );
  }

  async commitUpload(id: string, localPath: string, remotePath: string): Promise<CommitResult> {
    return this.withTransport(id, (transport) =>
      coreCommitUpload(transport, this.deps.backupManager, id, localPath, remotePath),
    );
  }

  /** ローカルフォルダとリモートディレクトリの差分同期プランを算出する（書き込みなし）。 */
  async prepareSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options: SyncFolderOptions = {},
  ): Promise<PrepareSyncResult> {
    return this.withTransport(id, async (dest) => {
      const source = await this.openLocalSource(localDir);
      const sourceEntries = await walkTree(source, '/', { ignore: options.ignore });
      const destEntries = await this.safeWalk(dest, remoteDir, options.ignore);
      const plan = planSync(sourceEntries, destEntries, {
        compareBy: options.compareBy,
        deleteExtraneous: options.deleteExtraneous,
      });
      return { plan, summary: summarizePlan(plan) };
    });
  }

  /** ローカルフォルダをリモートディレクトリへ差分同期する（上書きは事前バックアップ）。 */
  async commitSync(
    id: string,
    localDir: string,
    remoteDir: string,
    options: SyncFolderOptions = {},
  ): Promise<CommitSyncResult> {
    return this.withTransport(id, async (dest) => {
      const source = await this.openLocalSource(localDir);
      await dest.mkdir(remoteDir);
      const sourceEntries = await walkTree(source, '/', { ignore: options.ignore });
      const destEntries = await this.safeWalk(dest, remoteDir, options.ignore);
      const plan = planSync(sourceEntries, destEntries, {
        compareBy: options.compareBy,
        deleteExtraneous: options.deleteExtraneous,
      });
      const result = await runSync(source, dest, plan, {
        backupManager: this.deps.backupManager,
        profileId: id,
        sourceBase: '/',
        destBase: remoteDir,
      });
      return { result, summary: summarizePlan(plan) };
    });
  }

  private async openLocalSource(localDir: string): Promise<LocalTransport> {
    const source = new LocalTransport(localDir);
    await source.connect();
    return source;
  }

  private async safeWalk(
    transport: RemoteTransport,
    dir: string,
    ignore?: string[],
  ): Promise<SyncEntry[]> {
    try {
      return await walkTree(transport, dir, { ignore });
    } catch {
      // リモート側にディレクトリがまだ存在しない場合は空とみなす。
      return [];
    }
  }

  /** ダウンロード差分プレビュー（before=既存ローカル, after=リモート新内容）。 */
  async prepareDownload(id: string, remotePath: string, savePath: string): Promise<DownloadPreview> {
    const { local, localPath } = await this.openLocalTarget(savePath);
    return this.withTransport(id, (remote) =>
      corePrepareDownload(remote, local, remotePath, localPath),
    );
  }

  /** リモートファイルをローカルへダウンロードする（上書き前に既存ローカルをバックアップ）。 */
  async download(id: string, remotePath: string, savePath: string): Promise<DownloadResult> {
    const { local, localPath } = await this.openLocalTarget(savePath);
    return this.withTransport(id, (remote) =>
      coreCommitDownload(remote, local, this.deps.backupManager, id, remotePath, localPath),
    );
  }

  private async openLocalTarget(savePath: string): Promise<{ local: LocalTransport; localPath: string }> {
    const local = new LocalTransport(path.dirname(savePath));
    await local.connect();
    return { local, localPath: `/${path.basename(savePath)}` };
  }

  /** リモートファイル/ディレクトリをリネーム（移動）する。 */
  async renameRemote(id: string, from: string, to: string): Promise<void> {
    return this.withTransport(id, async (transport) => {
      if (!transport.rename) throw new Error('rename is not supported by this transport');
      await transport.rename(from, to);
    });
  }

  /** リモートファイル/ディレクトリを削除する。 */
  async deleteRemote(id: string, remotePath: string): Promise<void> {
    return this.withTransport(id, (transport) => transport.delete(remotePath));
  }

  /** リモートファイルのパーミッションを変更する（対応トランスポートのみ）。 */
  async chmodRemote(id: string, remotePath: string, mode: number): Promise<void> {
    return this.withTransport(id, async (transport) => {
      if (!transport.chmod) throw new Error('chmod is not supported by this transport');
      await transport.chmod(remotePath, mode);
    });
  }

  async listBackups(id: string, remotePath: string): Promise<BackupInfo[]> {
    return this.deps.backupManager.listBackups(id, remotePath);
  }

  /** バックアップ内容をリモートへ書き戻す（世代を指定しなければ最新）。 */
  async restoreBackup(
    id: string,
    remotePath: string,
    timestamp?: Date,
  ): Promise<{ bytesWritten: number }> {
    const data = await this.deps.backupManager.restore(id, remotePath, timestamp);
    return this.withTransport(id, async (transport) => {
      await transport.writeFile(remotePath, data);
      return { bytesWritten: data.length };
    });
  }

  private async resolveTransport(id: string): Promise<RemoteTransport> {
    const profiles = await this.deps.profileStore.list();
    const profile = profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`profile not found: ${id}`);
    const secrets = (await this.deps.secretStore.getSecrets(id)) ?? {};
    return this.deps.createTransport(profile, secrets);
  }

  private async withTransport<T>(
    id: string,
    fn: (transport: RemoteTransport) => Promise<T>,
  ): Promise<T> {
    const transport = await this.resolveTransport(id);
    await transport.connect();
    try {
      return await fn(transport);
    } finally {
      await transport.disconnect();
    }
  }
}
