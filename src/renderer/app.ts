import type { Profile, Protocol } from '../core/profile/index';
import type { RemoteEntry } from '../core/transport/index';
import type { BackupInfo } from '../core/backup/index';
import type { CompareBy } from '../core/sync/index';
import type { QueueStatus, SyncFolderOptions } from '../shared/ipc';
import { createDiffView, diffOrientationLabels } from './diff-view';
import { createSyncPlanView } from './sync-view';
import {
  buildProfileFromForm,
  profileToFormValues,
  emptyFormValues,
  type FormValues,
} from './profile-form';

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
  editing: Profile | null;
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
    editing: null,
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
  const queuePanel = h('div', { class: 'queue_1' });

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
        h('button', { class: 'btn_1', onclick: () => void selectProfile(p.id) }, ['接続']),
        h(
          'button',
          {
            class: 'btn_1',
            onclick: () => {
              state.editing = p;
              renderProfiles();
            },
          },
          ['編集'],
        ),
        h('button', { class: 'btn_1', onclick: () => void deleteProfile(p.id) }, ['削除']),
      ]);
      list.append(item);
    }
    profilePanel.append(list);
    profilePanel.append(renderProfileForm());
  }

  function renderProfileForm(): HTMLElement {
    const editing = state.editing;
    const fv: FormValues = editing ? profileToFormValues(editing) : emptyFormValues();

    const form = h('form', { class: 'form_1' });
    const proto = h('select', { class: 'form_1__input' }, [
      h('option', { value: 'ftp' }, ['FTP']),
      h('option', { value: 'sftp' }, ['SFTP']),
      h('option', { value: 's3' }, ['S3']),
    ]) as HTMLSelectElement;
    proto.value = fv.protocol;

    const fields = h('div', { class: 'form_1__fields' });

    function input(value: string, label: string, type = 'text'): HTMLInputElement {
      return h('input', { class: 'form_1__input', type, value, placeholder: label }) as HTMLInputElement;
    }
    function textarea(value: string, label: string): HTMLTextAreaElement {
      const el = h('textarea', { class: 'form_1__input', placeholder: label }) as HTMLTextAreaElement;
      el.value = value;
      return el;
    }
    function select(value: string, options: Array<[string, string]>): HTMLSelectElement {
      const el = h(
        'select',
        { class: 'form_1__input' },
        options.map(([v, label]) => h('option', { value: v }, [label])),
      ) as HTMLSelectElement;
      el.value = value;
      return el;
    }

    const idIn = input(fv.id, 'ID（一意）');
    if (editing) idIn.readOnly = true; // 編集は同一idの上書き
    const nameIn = input(fv.name, '表示名');
    const hostIn = input(fv.host, 'ホスト');
    const portIn = input(String(fv.port), 'ポート', 'number');
    const userIn = input(fv.user, 'ユーザー');
    const passIn = input('', editing ? 'パスワード（変更時のみ入力）' : 'パスワード', 'password');
    const ftpSecIn = select(fv.ftpSecurity, [
      ['explicit', 'FTPS 明示 (AUTH TLS)'],
      ['implicit', 'FTPS 暗黙 (implicit)'],
      ['none', '平文 FTP（非推奨）'],
    ]);
    const hostKeyIn = select(fv.hostKeyPolicy, [
      ['tofu', 'ホスト鍵: TOFU（初回信頼）'],
      ['strict', 'ホスト鍵: strict（既知のみ）'],
    ]);
    const keyIn = textarea('', editing ? '秘密鍵（変更時のみ入力）' : '秘密鍵（PEM）');
    const passphraseIn = input('', 'パスフレーズ', 'password');
    const regionIn = input(fv.region, 'リージョン');
    const bucketIn = input(fv.bucket, 'バケット');
    const akidIn = input(fv.accessKeyId, 'Access Key ID');
    const secretIn = input('', editing ? 'Secret Access Key（変更時のみ）' : 'Secret Access Key', 'password');

    function rebuildFields(): void {
      fields.replaceChildren(idIn, nameIn);
      const proto2 = proto.value as Protocol;
      if (proto2 === 'ftp') {
        fields.append(hostIn, portIn, userIn, passIn, h('label', {}, ['TLS: ', ftpSecIn]));
      } else if (proto2 === 'sftp') {
        fields.append(hostIn, portIn, userIn, passIn, keyIn, passphraseIn, h('label', {}, ['鍵検証: ', hostKeyIn]));
      } else {
        fields.append(regionIn, bucketIn, akidIn, secretIn);
      }
    }
    proto.addEventListener('change', rebuildFields);
    rebuildFields();

    const submit = h('button', { class: 'btn_1 btn_1--primary', type: 'submit' }, ['保存']);
    const newBtn = h(
      'button',
      {
        class: 'btn_1',
        type: 'button',
        onclick: () => {
          state.editing = null;
          renderProfiles();
        },
      },
      ['新規'],
    );

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const values: FormValues = {
        protocol: proto.value as Protocol,
        id: idIn.value.trim(),
        name: nameIn.value.trim(),
        host: hostIn.value.trim(),
        port: Number(portIn.value),
        user: userIn.value.trim(),
        password: passIn.value,
        ftpSecurity: ftpSecIn.value as FormValues['ftpSecurity'],
        privateKey: keyIn.value,
        passphrase: passphraseIn.value,
        hostKeyPolicy: hostKeyIn.value as FormValues['hostKeyPolicy'],
        region: regionIn.value.trim(),
        bucket: bucketIn.value.trim(),
        accessKeyId: akidIn.value.trim(),
        secretAccessKey: secretIn.value,
      };
      void saveProfile(buildProfileFromForm(values));
    });

    form.append(
      h('h3', {}, [editing ? `プロファイル編集: ${editing.id}` : 'プロファイル新規追加']),
      proto,
      fields,
      h('div', { class: 'form_1__actions' }, [submit, newBtn]),
    );
    return form;
  }

  async function saveProfile(p: Profile): Promise<void> {
    const r = await guard('プロファイル保存', () => api.saveProfile(p));
    if (r) {
      state.editing = null;
      await refreshProfiles();
    }
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

    const enqueueBtn = h(
      'button',
      { class: 'btn_1', onclick: () => void enqueueUpload(remoteIn.value.trim()) },
      ['キューに追加'],
    );

    transferPanel.append(
      localLabel,
      pickBtn,
      h('label', {}, ['先: ', remoteIn]),
      previewBtn,
      enqueueBtn,
      diffPanel,
    );
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
    const preview = await guard('ダウンロード差分', () =>
      api.prepareDownload(state.currentProfileId as string, remotePath, savePath),
    );
    diffPanel.replaceChildren();
    if (!preview) return;
    const labels = diffOrientationLabels('download');
    diffPanel.append(
      h('div', { class: 'diff_1__orient' }, [`− ${labels.beforeLabel} ／ ＋ ${labels.afterLabel}`]),
      createDiffView(preview),
      h(
        'button',
        {
          class: 'btn_1 btn_1--primary',
          onclick: () => void commitDownloadNow(remotePath, savePath),
        },
        ['この内容でダウンロード確定'],
      ),
    );
  }

  async function commitDownloadNow(remotePath: string, savePath: string): Promise<void> {
    if (!state.currentProfileId) return;
    const r = await guard('ダウンロード確定', () =>
      api.download(state.currentProfileId as string, remotePath, savePath),
    );
    if (r) {
      setStatus(
        `ダウンロード完了: ${r.bytesWritten}B → ${savePath}` +
          (r.backupPath ? ` / バックアップ: ${r.backupPath}` : ' / バックアップなし（新規）'),
      );
      await loadLocal(state.localDir);
    }
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
      h('button', { class: 'btn_1', onclick: () => void enqueueSync(remoteIn.value.trim(), opts()) }, [
        'キューで同期',
      ]),
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

  // ---- transfer queue -------------------------------------------------------
  async function enqueueUpload(remotePath: string): Promise<void> {
    if (!state.currentProfileId || !state.selectedLocal || !remotePath) {
      setStatus('プロファイル・ローカルファイル・リモートパスが必要です', true);
      return;
    }
    await api.enqueueTransfer({
      kind: 'upload',
      profileId: state.currentProfileId,
      localPath: state.selectedLocal,
      remotePath,
      label: basename(state.selectedLocal),
    });
    setStatus('アップロードをキューに追加しました');
    await refreshQueue();
  }

  async function enqueueSync(remoteDir: string, options: SyncFolderOptions): Promise<void> {
    if (!state.currentProfileId || !state.syncLocalDir) {
      setStatus('プロファイルとローカルフォルダが必要です', true);
      return;
    }
    await api.enqueueTransfer({
      kind: 'sync',
      profileId: state.currentProfileId,
      localDir: state.syncLocalDir,
      remoteDir,
      options,
      label: `sync → ${remoteDir}`,
    });
    setStatus('フォルダ同期をキューに追加しました');
    await refreshQueue();
  }

  async function refreshQueue(): Promise<void> {
    const status = await api.queueStatus();
    renderQueue(status);
  }

  function renderQueue(status: QueueStatus): void {
    queuePanel.replaceChildren();
    queuePanel.append(h('h2', {}, ['転送キュー']));

    const pct = Math.round(status.overall.ratio * 100);
    const fill = h('div', { class: 'queue_1__barfill' });
    fill.style.width = `${pct}%`;
    queuePanel.append(h('div', { class: 'queue_1__bar' }, [fill]), h('div', {}, [`全体 ${pct}%`]));

    const list = h('ul', { class: 'list_1' });
    for (const t of status.tasks) {
      list.append(
        h('li', { class: `list_1__item is_${t.status}` }, [
          h('span', { class: 'list_1__label' }, [
            `[${t.kind}] ${t.label ?? t.id} — ${t.status}` + (t.attempts > 1 ? `（試行${t.attempts}）` : ''),
          ]),
        ]),
      );
    }
    queuePanel.append(list);
    queuePanel.append(
      h(
        'button',
        {
          class: 'btn_1',
          onclick: () => {
            void api.cancelAllTasks().then(() => refreshQueue());
          },
        },
        ['全キャンセル'],
      ),
    );
  }

  // ---- boot -----------------------------------------------------------------
  container.replaceChildren(
    h('header', { class: 'header_1' }, [h('h1', {}, ['SFTPS — FTP / SFTP / S3 クライアント'])]),
    secretWarn,
    h('main', { class: 'layout_1' }, [
      h('section', { class: 'layout_1__col' }, [profilePanel]),
      h('section', { class: 'layout_1__col' }, [localPanel, remotePanel]),
      h('section', { class: 'layout_1__col' }, [transferPanel, syncPanel, backupPanel, queuePanel]),
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
    await refreshQueue();
    window.setInterval(() => void refreshQueue(), 1500);
  })();
}
