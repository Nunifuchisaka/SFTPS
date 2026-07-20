import type { FtpSecurity, Profile, Protocol } from '../core/profile/index';
import type { RemoteEntry } from '../core/transport/index';
import type { BackupInfo } from '../core/backup/index';
import type { CompareBy } from '../core/sync/index';
import type { SyncFolderOptions } from '../shared/ipc';
import { createDiffView } from './diff-view';
import { createSyncPlanView } from './sync-view';

const api = window.api;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: className, ...rest } = props as Record<string, unknown> & { class?: string };
  if (className) el.className = className;
  Object.assign(el, rest);
  for (const child of children) {
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return norm.slice(norm.lastIndexOf('/') + 1);
}

function parentDir(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = norm.lastIndexOf('/');
  if (idx <= 0) return norm.startsWith('/') ? '/' : norm;
  return norm.slice(0, idx);
}

interface State {
  profiles: Profile[];
  currentProfileId: string | null;
  localDir: string;
  localEntries: RemoteEntry[];
  selectedLocal: string | null;
  remoteDir: string;
  remoteEntries: RemoteEntry[];
  selectedRemote: string | null;
  syncLocalDir: string | null;
}

export function mountApp(root: string | HTMLElement): void {
  const container = typeof root === 'string' ? document.getElementById(root)! : root;

  const state: State = {
    profiles: [],
    currentProfileId: null,
    localDir: '',
    localEntries: [],
    selectedLocal: null,
    remoteDir: '/',
    remoteEntries: [],
    selectedRemote: null,
    syncLocalDir: null,
  };

  const statusBar = h('div', { class: 'status_1' });
  const secretWarn = h('div', { class: 'warn_1', hidden: true });
  const profilePanel = h('div', { class: 'panel_1' });
  const localPanel = h('div', { class: 'browser_1' });
  const remotePanel = h('div', { class: 'browser_1' });
  const transferPanel = h('div', { class: 'transfer_1' });
  const diffPanel = h('div', { class: 'diffwrap_1' });
  const backupPanel = h('div', { class: 'backup_1' });
  const syncPanel = h('div', { class: 'sync_1' });
  const syncPlanPanel = h('div', { class: 'diffwrap_1' });

  function setStatus(msg: string, isError = false): void {
    statusBar.textContent = msg;
    statusBar.classList.toggle('is_error', isError);
  }

  async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      setStatus(`${label}...`);
      const result = await fn();
      setStatus(`${label}: 完了`);
      return result;
    } catch (err) {
      setStatus(`${label}: 失敗 - ${err instanceof Error ? err.message : String(err)}`, true);
      return undefined;
    }
  }

  // ---- profiles -------------------------------------------------------------
  async function refreshProfiles(): Promise<void> {
    state.profiles = (await guard('プロファイル読込', () => api.listProfiles())) ?? [];
    renderProfiles();
  }

  function renderProfiles(): void {
    profilePanel.replaceChildren();
    profilePanel.append(h('h2', {}, ['接続プロファイル']));

    const list = h('ul', { class: 'list_1' });
    for (const p of state.profiles) {
      const active = p.id === state.currentProfileId;
      const item = h('li', { class: `list_1__item${active ? ' is_active' : ''}` }, [
        h('span', { class: 'list_1__label' }, [`${p.name} [${p.protocol}]`]),
        h(
          'button',
          { class: 'btn_1', onclick: () => void selectProfile(p.id) },
          ['接続'],
        ),
        h(
          'button',
          { class: 'btn_1', onclick: () => void deleteProfile(p.id) },
          ['削除'],
        ),
      ]);
      list.append(item);
    }
    profilePanel.append(list);
    profilePanel.append(renderProfileForm());
  }

  function renderProfileForm(): HTMLElement {
    const form = h('form', { class: 'form_1' });
    const proto = h('select', { class: 'form_1__input' }, [
      h('option', { value: 'ftp' }, ['FTP']),
      h('option', { value: 'sftp' }, ['SFTP']),
      h('option', { value: 's3' }, ['S3']),
    ]) as HTMLSelectElement;

    const fields = h('div', { class: 'form_1__fields' });

    function input(name: string, label: string, type = 'text'): HTMLInputElement {
      const inp = h('input', { class: 'form_1__input', type, name, placeholder: label });
      return inp as HTMLInputElement;
    }
    function textarea(name: string, label: string): HTMLTextAreaElement {
      return h('textarea', { class: 'form_1__input', name, placeholder: label }) as HTMLTextAreaElement;
    }

    const idIn = input('id', 'ID（一意）');
    const nameIn = input('name', '表示名');
    const hostIn = input('host', 'ホスト');
    const portIn = input('port', 'ポート', 'number');
    const userIn = input('user', 'ユーザー');
    const passIn = input('password', 'パスワード', 'password');
    const ftpSecIn = h('select', { class: 'form_1__input' }, [
      h('option', { value: 'explicit' }, ['FTPS 明示 (AUTH TLS)']),
      h('option', { value: 'implicit' }, ['FTPS 暗黙 (implicit)']),
      h('option', { value: 'none' }, ['平文 FTP（非推奨）']),
    ]) as HTMLSelectElement;
    const keyIn = textarea('privateKey', '秘密鍵（PEM）');
    const passphraseIn = input('passphrase', 'パスフレーズ', 'password');
    const regionIn = input('region', 'リージョン');
    const bucketIn = input('bucket', 'バケット');
    const akidIn = input('accessKeyId', 'Access Key ID');
    const secretIn = input('secretAccessKey', 'Secret Access Key', 'password');

    function rebuildFields(): void {
      fields.replaceChildren(idIn, nameIn);
      const proto2 = proto.value as Protocol;
      if (proto2 === 'ftp') {
        fields.append(hostIn, portIn, userIn, passIn, h('label', {}, ['TLS: ', ftpSecIn]));
      } else if (proto2 === 'sftp') {
        fields.append(hostIn, portIn, userIn, passIn, keyIn, passphraseIn);
      } else {
        fields.append(regionIn, bucketIn, akidIn, secretIn);
      }
    }
    proto.addEventListener('change', rebuildFields);
    rebuildFields();

    const submit = h('button', { class: 'btn_1 btn_1--primary', type: 'submit' }, ['保存']);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const p = buildProfileFromForm(proto.value as Protocol, {
        id: idIn.value.trim(),
        name: nameIn.value.trim(),
        host: hostIn.value.trim(),
        port: Number(portIn.value),
        user: userIn.value.trim(),
        password: passIn.value,
        ftpSecurity: ftpSecIn.value as FtpSecurity,
        privateKey: keyIn.value,
        passphrase: passphraseIn.value,
        region: regionIn.value.trim(),
        bucket: bucketIn.value.trim(),
        accessKeyId: akidIn.value.trim(),
        secretAccessKey: secretIn.value,
      });
      void saveProfile(p);
    });

    form.append(h('h3', {}, ['プロファイル追加/編集']), proto, fields, submit);
    return form;
  }

  async function saveProfile(p: Profile): Promise<void> {
    const r = await guard('プロファイル保存', () => api.saveProfile(p));
    if (r) await refreshProfiles();
  }

  async function deleteProfile(id: string): Promise<void> {
    await guard('プロファイル削除', () => api.deleteProfile(id));
    if (state.currentProfileId === id) state.currentProfileId = null;
    await refreshProfiles();
  }

  async function selectProfile(id: string): Promise<void> {
    state.currentProfileId = id;
    renderProfiles();
    const conn = await guard('接続テスト', () => api.testConnection(id));
    if (conn && !conn.ok) {
      setStatus(`接続失敗: ${conn.error ?? ''}`, true);
    }
    state.remoteDir = '/';
    await loadRemote('/');
  }

  // ---- local browser --------------------------------------------------------
  async function loadLocal(dir: string): Promise<void> {
    const entries = await guard('ローカル一覧', () => api.listLocal(dir));
    if (!entries) return;
    state.localDir = dir;
    state.localEntries = entries;
    renderLocal();
  }

  function renderLocal(): void {
    localPanel.replaceChildren();
    localPanel.append(
      h('h2', {}, ['ローカル']),
      h('div', { class: 'browser_1__path' }, [state.localDir || '(未選択)']),
      h('button', { class: 'btn_1', onclick: () => void loadLocal(parentDir(state.localDir)) }, ['..上へ']),
    );
    const list = h('ul', { class: 'list_1' });
    for (const e of state.localEntries) {
      const selected = e.type === 'file' && e.path === state.selectedLocal;
      const item = h('li', { class: `list_1__item${selected ? ' is_active' : ''}` }, [
        h(
          'span',
          {
            class: 'list_1__label',
            onclick: () => {
              if (e.type === 'dir') void loadLocal(e.path);
              else {
                state.selectedLocal = e.path;
                renderLocal();
                renderTransfer();
              }
            },
          },
          [`${e.type === 'dir' ? '📁' : '📄'} ${e.name}`],
        ),
      ]);
      list.append(item);
    }
    localPanel.append(list);
  }

  // ---- remote browser -------------------------------------------------------
  async function loadRemote(dir: string): Promise<void> {
    if (!state.currentProfileId) {
      setStatus('先にプロファイルへ接続してください', true);
      return;
    }
    const entries = await guard('リモート一覧', () =>
      api.listRemote(state.currentProfileId as string, dir),
    );
    if (!entries) return;
    state.remoteDir = dir;
    state.remoteEntries = entries;
    renderRemote();
    renderTransfer();
  }

  function renderRemote(): void {
    remotePanel.replaceChildren();
    remotePanel.append(
      h('h2', {}, ['リモート']),
      h('div', { class: 'browser_1__path' }, [state.remoteDir]),
      h('button', { class: 'btn_1', onclick: () => void loadRemote(parentDir(state.remoteDir)) }, ['..上へ']),
    );
    const list = h('ul', { class: 'list_1' });
    for (const e of state.remoteEntries) {
      const selected = e.type === 'file' && e.path === state.selectedRemote;
      const item = h('li', { class: `list_1__item${selected ? ' is_active' : ''}` }, [
        h(
          'span',
          {
            class: 'list_1__label',
            onclick: () => {
              if (e.type === 'dir') void loadRemote(e.path);
              else {
                state.selectedRemote = e.path;
                renderRemote();
                renderTransfer();
                void loadBackups(e.path);
              }
            },
          },
          [`${e.type === 'dir' ? '📁' : '📄'} ${e.name} (${e.size}B)`],
        ),
        e.type === 'file'
          ? h('button', { class: 'btn_1', onclick: () => void downloadFile(e.path) }, ['DL'])
          : document.createTextNode(''),
      ]);
      list.append(item);
    }
    remotePanel.append(list);
  }

  // ---- transfer / diff ------------------------------------------------------
  function renderTransfer(): void {
    transferPanel.replaceChildren();
    transferPanel.append(h('h2', {}, ['アップロード']));

    const localLabel = h('div', {}, [`ローカル: ${state.selectedLocal ?? '(未選択)'}`]);
    const pickBtn = h('button', { class: 'btn_1', onclick: () => void pickLocalFile() }, ['ファイル選択...']);

    const defaultRemote =
      state.selectedLocal !== null
        ? (state.remoteDir === '/' ? '' : state.remoteDir) + '/' + basename(state.selectedLocal)
        : state.remoteDir;
    const remoteIn = h('input', {
      class: 'form_1__input',
      type: 'text',
      value: defaultRemote,
      placeholder: 'アップロード先リモートパス',
    }) as HTMLInputElement;

    const previewBtn = h(
      'button',
      {
        class: 'btn_1 btn_1--primary',
        onclick: () => void previewUpload(remoteIn.value.trim()),
      },
      ['差分プレビュー'],
    );

    transferPanel.append(localLabel, pickBtn, h('label', {}, ['先: ', remoteIn]), previewBtn, diffPanel);
  }

  async function pickLocalFile(): Promise<void> {
    const picked = await api.pickFile();
    if (picked) {
      state.selectedLocal = picked;
      renderTransfer();
    }
  }

  async function previewUpload(remotePath: string): Promise<void> {
    if (!state.currentProfileId || !state.selectedLocal || !remotePath) {
      setStatus('プロファイル・ローカルファイル・リモートパスが必要です', true);
      return;
    }
    const preview = await guard('差分プレビュー', () =>
      api.prepareUpload(state.currentProfileId as string, state.selectedLocal as string, remotePath),
    );
    diffPanel.replaceChildren();
    if (!preview) return;
    diffPanel.append(createDiffView(preview));
    diffPanel.append(
      h(
        'button',
        {
          class: 'btn_1 btn_1--primary',
          onclick: () => void commitUpload(remotePath),
        },
        ['この内容でアップロード確定'],
      ),
    );
  }

  async function commitUpload(remotePath: string): Promise<void> {
    if (!state.currentProfileId || !state.selectedLocal) return;
    const r = await guard('アップロード確定', () =>
      api.commitUpload(state.currentProfileId as string, state.selectedLocal as string, remotePath),
    );
    if (r) {
      setStatus(
        `アップロード完了: ${r.bytesWritten}B` +
          (r.backupPath ? ` / バックアップ: ${r.backupPath}` : ' / バックアップなし（新規）'),
      );
      await loadRemote(state.remoteDir);
      await loadBackups(remotePath);
    }
  }

  async function downloadFile(remotePath: string): Promise<void> {
    if (!state.currentProfileId) return;
    const savePath = await api.pickSavePath(basename(remotePath));
    if (!savePath) return;
    const r = await guard('ダウンロード', () =>
      api.download(state.currentProfileId as string, remotePath, savePath),
    );
    if (r) setStatus(`ダウンロード完了: ${r.bytesWritten}B → ${savePath}`);
  }

  // ---- backups --------------------------------------------------------------
  async function loadBackups(remotePath: string): Promise<void> {
    if (!state.currentProfileId) return;
    const backups = await guard('バックアップ一覧', () =>
      api.listBackups(state.currentProfileId as string, remotePath),
    );
    renderBackups(remotePath, backups ?? []);
  }

  function renderBackups(remotePath: string, backups: BackupInfo[]): void {
    backupPanel.replaceChildren();
    backupPanel.append(h('h2', {}, ['バックアップ履歴']), h('div', {}, [remotePath]));
    if (backups.length === 0) {
      backupPanel.append(h('div', {}, ['履歴なし']));
      return;
    }
    const list = h('ul', { class: 'list_1' });
    for (const b of backups) {
      const ts = new Date(b.timestamp);
      list.append(
        h('li', { class: 'list_1__item' }, [
          h('span', { class: 'list_1__label' }, [ts.toLocaleString()]),
          h(
            'button',
            { class: 'btn_1', onclick: () => void restoreBackup(remotePath, ts) },
            ['復元'],
          ),
        ]),
      );
    }
    backupPanel.append(list);
  }

  async function restoreBackup(remotePath: string, timestamp: Date): Promise<void> {
    if (!state.currentProfileId) return;
    const r = await guard('復元', () =>
      api.restoreBackup(state.currentProfileId as string, remotePath, timestamp),
    );
    if (r) {
      setStatus(`復元完了: ${r.bytesWritten}B をリモートへ書き戻し`);
      await loadRemote(state.remoteDir);
    }
  }

  // ---- folder sync ----------------------------------------------------------
  function renderSync(): void {
    syncPanel.replaceChildren();
    const remoteIn = h('input', {
      class: 'form_1__input',
      type: 'text',
      value: state.remoteDir,
      placeholder: '同期先リモートディレクトリ',
    }) as HTMLInputElement;
    const compareSel = h('select', { class: 'form_1__input' }, [
      h('option', { value: 'size-and-mtime' }, ['サイズ+更新時刻']),
      h('option', { value: 'size' }, ['サイズのみ']),
      h('option', { value: 'mtime' }, ['更新時刻のみ']),
    ]) as HTMLSelectElement;
    const delChk = h('input', { type: 'checkbox' }) as HTMLInputElement;

    const opts = (): SyncFolderOptions => ({
      compareBy: compareSel.value as CompareBy,
      deleteExtraneous: delChk.checked,
    });

    syncPanel.append(
      h('h2', {}, ['フォルダ差分同期']),
      h('div', {}, [`ローカル: ${state.syncLocalDir ?? '(未選択)'}`]),
      h('button', { class: 'btn_1', onclick: () => void pickSyncDir() }, ['フォルダ選択...']),
      h('label', {}, ['先: ', remoteIn]),
      h('label', {}, ['判定: ', compareSel]),
      h('label', {}, [delChk, ' 余剰ファイルを削除（ミラー・注意）']),
      h('button', { class: 'btn_1', onclick: () => void planSyncNow(remoteIn.value.trim(), opts()) }, [
        'プラン作成',
      ]),
      h(
        'button',
        { class: 'btn_1 btn_1--primary', onclick: () => void runSyncNow(remoteIn.value.trim(), opts()) },
        ['同期実行'],
      ),
      syncPlanPanel,
    );
  }

  async function pickSyncDir(): Promise<void> {
    const picked = await api.pickDirectory();
    if (picked) {
      state.syncLocalDir = picked;
      renderSync();
    }
  }

  async function planSyncNow(remoteDir: string, options: SyncFolderOptions): Promise<void> {
    if (!state.currentProfileId || !state.syncLocalDir) {
      setStatus('プロファイルとローカルフォルダが必要です', true);
      return;
    }
    const r = await guard('同期プラン作成', () =>
      api.prepareSync(state.currentProfileId as string, state.syncLocalDir as string, remoteDir, options),
    );
    syncPlanPanel.replaceChildren();
    if (r) syncPlanPanel.append(createSyncPlanView(r.plan, r.summary));
  }

  async function runSyncNow(remoteDir: string, options: SyncFolderOptions): Promise<void> {
    if (!state.currentProfileId || !state.syncLocalDir) {
      setStatus('プロファイルとローカルフォルダが必要です', true);
      return;
    }
    const r = await guard('同期実行', () =>
      api.commitSync(state.currentProfileId as string, state.syncLocalDir as string, remoteDir, options),
    );
    if (r) {
      const s = r.result;
      setStatus(
        `同期完了: up ${s.uploaded} / dir ${s.createdDirs} / skip ${s.skipped} / del ${s.deleted}`,
      );
      await loadRemote(state.remoteDir);
    }
  }

  // ---- boot -----------------------------------------------------------------
  container.replaceChildren(
    h('header', { class: 'header_1' }, [h('h1', {}, ['SFTPS — FTP / SFTP / S3 クライアント'])]),
    secretWarn,
    h('main', { class: 'layout_1' }, [
      h('section', { class: 'layout_1__col' }, [profilePanel]),
      h('section', { class: 'layout_1__col' }, [localPanel, remotePanel]),
      h('section', { class: 'layout_1__col' }, [transferPanel, syncPanel, backupPanel]),
    ]),
    statusBar,
  );

  void (async () => {
    const available = await api.isSecretStorageAvailable();
    if (!available) {
      secretWarn.hidden = false;
      secretWarn.textContent =
        'このOSでは安全な暗号化ストレージ（safeStorage）が利用できません。シークレットを含むプロファイルは保存できません。';
    }
    const home = await api.homeDir();
    await loadLocal(home);
    await refreshProfiles();
    renderTransfer();
    renderSync();
  })();
}

function buildProfileFromForm(
  protocol: Protocol,
  v: {
    id: string;
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    ftpSecurity: FtpSecurity;
    privateKey: string;
    passphrase: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
): Profile {
  if (protocol === 'ftp') {
    return {
      id: v.id,
      name: v.name,
      protocol: 'ftp',
      host: v.host,
      port: v.port,
      user: v.user,
      ftpSecurity: v.ftpSecurity,
      ...(v.password ? { password: v.password } : {}),
    };
  }
  if (protocol === 'sftp') {
    return {
      id: v.id,
      name: v.name,
      protocol: 'sftp',
      host: v.host,
      port: v.port,
      user: v.user,
      ...(v.password ? { password: v.password } : {}),
      ...(v.privateKey ? { privateKey: v.privateKey } : {}),
      ...(v.passphrase ? { passphrase: v.passphrase } : {}),
    };
  }
  return {
    id: v.id,
    name: v.name,
    protocol: 's3',
    region: v.region,
    bucket: v.bucket,
    ...(v.accessKeyId ? { accessKeyId: v.accessKeyId } : {}),
    ...(v.secretAccessKey ? { secretAccessKey: v.secretAccessKey } : {}),
  };
}
