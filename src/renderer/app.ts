import type { Profile, Protocol, SecretKey } from '../core/profile/index';
import type { RemoteEntry } from '../core/transport/index';
import type { BackupInfo } from '../core/backup/index';
// ガード関数は純粋モジュールから直接読む（BackupManager 等の node:fs 依存をレンダラへ持ち込まないため）。
import { confirmRestore } from '../core/backup/restore-guard';
import { confirmMirrorDeletion, validateSyncDestination } from '../core/sync/guard';
import type { CompareBy } from '../core/sync/index';
import {
  filterEntries,
  sortEntries,
  toggleSelection,
  pruneSelection,
  resolveDropTargets,
  type SortKey,
  type SortDir,
  type DroppedItem,
} from '../core/browse/index';
import { confirmDeletion, parseMode, isActionAvailable } from '../core/remoteops/index';
import type { HistoryFilter, HistoryKind, HistoryStatus } from '../core/history/index';
import type { Bookmark } from '../core/bookmark/index';
import type { KnownHostEntry } from '../core/hostkey/index';
import { createHistoryView } from './history-view';
import { createBookmarkView } from './bookmark-view';
import { createKnownHostsView } from './known-hosts-view';
import { createTranslator, dictionaries, resolveLocale, LOCALES } from '../core/i18n/index';
import { classifyConnectionError, connectionErrorMessageKey } from '../core/reconnect/index';
import { normalizeThemeSetting, THEME_SETTINGS, type ThemeSetting } from '../core/theme/index';
import { applyTheme } from './theme';
import type {
  PrepareSyncResult,
  QueueStatus,
  SaveProfileOptions,
  SyncFolderOptions,
} from '../shared/ipc';
import { createDiffView, diffOrientationLabels } from './diff-view';
import { createSyncPlanView } from './sync-view';
import { buildUploadRequests, buildRequestsFromDropTargets } from './bulk-transfer';
import { attachDropZone } from './dnd';
import {
  buildProfileFromForm,
  buildClearSecretsFromForm,
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
  showHidden: boolean;
  localFilter: string;
  remoteFilter: string;
  localSort: { key: SortKey; dir: SortDir };
  remoteSort: { key: SortKey; dir: SortDir };
  localSelection: Set<string>;
  remoteSelection: Set<string>;
  renamingPath: string | null;
  chmodPath: string | null;
  historyFilter: HistoryFilter;
  verifyAfterTransfer: boolean;
  bookmarks: Bookmark[];
  bookmarkName: string;
  knownHosts: KnownHostEntry[];
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
    showHidden: false,
    localFilter: '',
    remoteFilter: '',
    localSort: { key: 'name', dir: 'asc' },
    remoteSort: { key: 'name', dir: 'asc' },
    localSelection: new Set(),
    remoteSelection: new Set(),
    renamingPath: null,
    chmodPath: null,
    historyFilter: {},
    verifyAfterTransfer: false,
    bookmarks: [],
    bookmarkName: '',
    knownHosts: [],
  };

  let bookmarkSeq = 0;

  const locale = resolveLocale(
    window.localStorage.getItem('sftps.locale') ?? window.navigator.language,
    LOCALES,
    'ja',
  );
  const t = createTranslator(dictionaries, locale);

  function currentProtocol(): Protocol | null {
    const p = state.profiles.find((x) => x.id === state.currentProfileId);
    return p ? p.protocol : null;
  }

  function joinRemote(dir: string, name: string): string {
    return dir === '/' ? `/${name}` : `${dir}/${name}`;
  }

  const statusBar = h('div', { class: 'status_1' });
  const secretWarn = h('div', { class: 'warn_1', hidden: true });
  const profilePanel = h('div', { class: 'panel_1' });
  const knownHostsPanel = h('div', { class: 'panel_1' });
  const localPanel = h('div', { class: 'browser_1' });
  const remotePanel = h('div', { class: 'browser_1' });
  const transferPanel = h('div', { class: 'transfer_1' });
  const diffPanel = h('div', { class: 'diffwrap_1' });
  const backupPanel = h('div', { class: 'backup_1' });
  const syncPanel = h('div', { class: 'sync_1' });
  const syncPlanPanel = h('div', { class: 'diffwrap_1' });
  const queuePanel = h('div', { class: 'queue_1' });
  const historyPanel = h('div', { class: 'history_wrap_1' });

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

  /** void 操作用: 成功したら true。 */
  async function guardOk(label: string, fn: () => Promise<void>): Promise<boolean> {
    try {
      setStatus(`${label}...`);
      await fn();
      setStatus(`${label}: 完了`);
      return true;
    } catch (err) {
      setStatus(`${label}: 失敗 - ${err instanceof Error ? err.message : String(err)}`, true);
      return false;
    }
  }

  // ---- profiles -------------------------------------------------------------
  async function refreshProfiles(): Promise<void> {
    state.profiles = (await guard('プロファイル読込', () => api.listProfiles())) ?? [];
    renderProfiles();
  }

  function renderProfiles(): void {
    profilePanel.replaceChildren();
    profilePanel.append(h('h2', {}, [t('panel.profiles')]));

    const list = h('ul', { class: 'list_1' });
    for (const p of state.profiles) {
      const active = p.id === state.currentProfileId;
      const item = h('li', { class: `list_1__item${active ? ' is_active' : ''}` }, [
        h('span', { class: 'list_1__label' }, [`${p.name} [${p.protocol}]`]),
        h('button', { class: 'btn_1', onclick: () => void selectProfile(p.id) }, [t('btn.connect')]),
        h(
          'button',
          {
            class: 'btn_1',
            onclick: () => {
              state.editing = p;
              renderProfiles();
            },
          },
          [t('btn.edit')],
        ),
        h('button', { class: 'btn_1', onclick: () => void deleteProfile(p.id) }, [t('btn.delete')]),
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
    const passphraseIn = input('', editing ? 'パスフレーズ（変更時のみ入力）' : 'パスフレーズ', 'password');
    const regionIn = input(fv.region, 'リージョン');
    const bucketIn = input(fv.bucket, 'バケット');
    const akidIn = input(fv.accessKeyId, 'Access Key ID');
    const secretIn = input('', editing ? 'Secret Access Key（変更時のみ）' : 'Secret Access Key', 'password');

    // 空欄は「据え置き」。保存済みシークレットを消すのはこの明示チェックのみ（編集時のみ表示）。
    const clearChecks = new Map<SecretKey, HTMLInputElement>();
    function secretField(key: SecretKey, control: HTMLElement, label: string): HTMLElement {
      if (!editing) return control;
      const chk = h('input', { type: 'checkbox' }) as HTMLInputElement;
      clearChecks.set(key, chk);
      return h('div', { class: 'form_1__secret' }, [
        control,
        h('label', { class: 'form_1__clear' }, [chk, ` 保存済みの${label}を削除`]),
      ]);
    }
    const timeoutIn = input(fv.connectTimeoutMs, '接続タイムアウト(ms)', 'number');
    const reconnectIn = h('input', { type: 'checkbox' }) as HTMLInputElement;
    reconnectIn.checked = fv.autoReconnect;

    const commonFields = (): HTMLElement =>
      h('div', { class: 'form_1__fields' }, [
        h('label', {}, ['タイムアウト(ms): ', timeoutIn]),
        h('label', {}, [reconnectIn, ' 自動再接続']),
      ]);

    function rebuildFields(): void {
      fields.replaceChildren(idIn, nameIn);
      clearChecks.clear();
      const proto2 = proto.value as Protocol;
      if (proto2 === 'ftp') {
        fields.append(
          hostIn,
          portIn,
          userIn,
          secretField('password', passIn, 'パスワード'),
          h('label', {}, ['TLS: ', ftpSecIn]),
        );
      } else if (proto2 === 'sftp') {
        fields.append(
          hostIn,
          portIn,
          userIn,
          secretField('password', passIn, 'パスワード'),
          secretField('privateKey', keyIn, '秘密鍵'),
          secretField('passphrase', passphraseIn, 'パスフレーズ'),
          h('label', {}, ['鍵検証: ', hostKeyIn]),
        );
      } else {
        fields.append(
          regionIn,
          bucketIn,
          akidIn,
          secretField('secretAccessKey', secretIn, 'Secret Access Key'),
        );
      }
      fields.append(commonFields());
    }
    proto.addEventListener('change', rebuildFields);
    rebuildFields();

    const submit = h('button', { class: 'btn_1 btn_1--primary', type: 'submit' }, [t('btn.save')]);
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
      [t('btn.new')],
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
        connectTimeoutMs: timeoutIn.value.trim(),
        autoReconnect: reconnectIn.checked,
        clearSecrets: [...clearChecks].filter(([, chk]) => chk.checked).map(([key]) => key),
      };
      void saveProfile(buildProfileFromForm(values), {
        clearSecrets: buildClearSecretsFromForm(values),
      });
    });

    form.append(
      h('h3', {}, [editing ? t('form.editProfile', { id: editing.id }) : t('form.newProfile')]),
      proto,
      fields,
      h('div', { class: 'form_1__actions' }, [submit, newBtn]),
    );
    return form;
  }

  async function saveProfile(p: Profile, options: SaveProfileOptions): Promise<void> {
    if (options.clearSecrets && options.clearSecrets.length > 0) {
      const ok = window.confirm(
        `保存済みシークレット ${options.clearSecrets.length} 件（${options.clearSecrets.join(', ')}）を削除します。` +
          '削除したシークレットは復元できません。よろしいですか？',
      );
      if (!ok) return;
    }
    const r = await guard('プロファイル保存', () => api.saveProfile(p, options));
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
      // ホスト鍵・証明書の検証失敗は単なる接続失敗と区別して警告する。
      const key = connectionErrorMessageKey(classifyConnectionError(conn.error ?? ''));
      setStatus(key ? `${t(key)}（${conn.error ?? ''}）` : `接続失敗: ${conn.error ?? ''}`, true);
    }
    state.remoteDir = '/';
    await refreshBookmarks();
    await loadRemote('/');
  }

  // ---- known hosts ----------------------------------------------------------
  async function refreshKnownHosts(): Promise<void> {
    state.knownHosts = (await guard('信頼済みホスト鍵の読込', () => api.listKnownHosts())) ?? [];
    renderKnownHosts();
  }

  function renderKnownHosts(): void {
    knownHostsPanel.replaceChildren(
      h('h2', {}, [t('panel.knownHosts')]),
      h('div', { class: 'browser_1__tools' }, [
        h('button', { class: 'btn_1', onclick: () => void refreshKnownHosts() }, [
          t('knownHosts.reload'),
        ]),
      ]),
      createKnownHostsView(state.knownHosts, {
        onRemove: (entry) => void removeKnownHost(entry),
        labels: { remove: t('knownHosts.remove'), empty: t('knownHosts.empty') },
      }),
    );
  }

  /** 信頼を取り消す（正当な鍵更新後は、これで次回接続時に指紋確認をやり直せる）。 */
  async function removeKnownHost(entry: KnownHostEntry): Promise<void> {
    const ok = window.confirm(
      t('knownHosts.removeConfirm', { host: entry.host, port: entry.port }),
    );
    if (!ok) return;
    const removed = await guard('信頼済みホスト鍵の削除', () =>
      api.removeKnownHost(entry.host, entry.port),
    );
    if (removed === undefined) return;
    await refreshKnownHosts();
  }

  // ---- local browser --------------------------------------------------------
  async function loadLocal(dir: string): Promise<void> {
    const entries = await guard('ローカル一覧', () => api.listLocal(dir));
    if (!entries) return;
    state.localDir = dir;
    state.localEntries = entries;
    renderLocal();
  }

  function viewEntries(
    entries: RemoteEntry[],
    filter: string,
    sort: { key: SortKey; dir: SortDir },
  ): RemoteEntry[] {
    return sortEntries(
      filterEntries(entries, filter, { showHidden: state.showHidden }),
      sort.key,
      sort.dir,
    );
  }

  function sortHeader(
    label: string,
    key: SortKey,
    sort: { key: SortKey; dir: SortDir },
    onChange: (s: { key: SortKey; dir: SortDir }) => void,
  ): HTMLElement {
    const active = sort.key === key;
    const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return h(
      'button',
      {
        class: `btn_1${active ? ' is_active' : ''}`,
        onclick: () => onChange({ key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' }),
      },
      [label + arrow],
    );
  }

  function renderLocal(): void {
    localPanel.replaceChildren();
    state.localSelection = pruneSelection(
      state.localSelection,
      state.localEntries.filter((e) => e.type === 'file').map((e) => e.path),
    );
    const filterIn = h('input', {
      class: 'form_1__input',
      type: 'text',
      value: state.localFilter,
      placeholder: '絞り込み',
    }) as HTMLInputElement;
    filterIn.addEventListener('input', () => {
      state.localFilter = filterIn.value;
      renderLocal();
    });

    localPanel.append(
      h('h2', {}, [t('browser.local')]),
      h('div', { class: 'browser_1__path' }, [state.localDir || '(未選択)']),
      h('div', { class: 'browser_1__tools' }, [
        h('button', { class: 'btn_1', onclick: () => void loadLocal(parentDir(state.localDir)) }, [t('btn.up')]),
        filterIn,
        sortHeader('名前', 'name', state.localSort, (s) => {
          state.localSort = s;
          renderLocal();
        }),
        sortHeader('サイズ', 'size', state.localSort, (s) => {
          state.localSort = s;
          renderLocal();
        }),
        sortHeader('日時', 'modified', state.localSort, (s) => {
          state.localSort = s;
          renderLocal();
        }),
      ]),
    );

    const list = h('ul', { class: 'list_1' });
    for (const e of viewEntries(state.localEntries, state.localFilter, state.localSort)) {
      const children: Array<Node | string> = [];
      if (e.type === 'file') {
        const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
        cb.checked = state.localSelection.has(e.path);
        cb.addEventListener('change', () => {
          state.localSelection = toggleSelection(state.localSelection, e.path);
        });
        children.push(cb);
      }
      children.push(
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
      );
      const selected = e.type === 'file' && e.path === state.selectedLocal;
      list.append(h('li', { class: `list_1__item${selected ? ' is_active' : ''}` }, children));
    }
    localPanel.append(list);
    localPanel.append(
      h('button', { class: 'btn_1 btn_1--primary', onclick: () => void enqueueSelectedUploads() }, [
        '選択をキューにアップロード',
      ]),
    );
  }

  async function enqueueSelectedUploads(): Promise<void> {
    if (!state.currentProfileId) {
      setStatus('先にプロファイルへ接続してください', true);
      return;
    }
    const paths = [...state.localSelection];
    if (paths.length === 0) {
      setStatus('アップロードするファイルを選択してください', true);
      return;
    }
    const requests = buildUploadRequests(state.currentProfileId, paths, state.remoteDir);
    for (const req of requests) await api.enqueueTransfer(req);
    setStatus(`${requests.length}件をアップロードキューに追加しました`);
    await refreshQueue();
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
    state.remoteSelection = pruneSelection(
      state.remoteSelection,
      state.remoteEntries.filter((e) => e.type === 'file').map((e) => e.path),
    );
    const filterIn = h('input', {
      class: 'form_1__input',
      type: 'text',
      value: state.remoteFilter,
      placeholder: '絞り込み',
    }) as HTMLInputElement;
    filterIn.addEventListener('input', () => {
      state.remoteFilter = filterIn.value;
      renderRemote();
    });

    remotePanel.append(
      h('h2', {}, [t('browser.remoteDropHint')]),
      h('div', { class: 'browser_1__path' }, [state.remoteDir]),
      h('div', { class: 'browser_1__tools' }, [
        h('button', { class: 'btn_1', onclick: () => void loadRemote(parentDir(state.remoteDir)) }, [t('btn.up')]),
        filterIn,
        sortHeader('名前', 'name', state.remoteSort, (s) => {
          state.remoteSort = s;
          renderRemote();
        }),
        sortHeader('サイズ', 'size', state.remoteSort, (s) => {
          state.remoteSort = s;
          renderRemote();
        }),
        sortHeader('日時', 'modified', state.remoteSort, (s) => {
          state.remoteSort = s;
          renderRemote();
        }),
      ]),
    );

    const protocol = currentProtocol();
    const list = h('ul', { class: 'list_1' });
    for (const e of viewEntries(state.remoteEntries, state.remoteFilter, state.remoteSort)) {
      const children: Array<Node | string> = [];

      if (e.path === state.renamingPath) {
        const inp = h('input', { class: 'form_1__input', type: 'text', value: e.name }) as HTMLInputElement;
        children.push(
          inp,
          h('button', { class: 'btn_1 btn_1--primary', onclick: () => void doRename(e.path, inp.value) }, ['OK']),
          h('button', { class: 'btn_1', onclick: () => cancelInline() }, ['取消']),
        );
        list.append(h('li', { class: 'list_1__item' }, children));
        continue;
      }
      if (e.path === state.chmodPath) {
        const inp = h('input', { class: 'form_1__input', type: 'text', placeholder: '644' }) as HTMLInputElement;
        children.push(
          h('span', { class: 'list_1__label' }, [`${e.name} 権限: `]),
          inp,
          h('button', { class: 'btn_1 btn_1--primary', onclick: () => void doChmod(e.path, inp.value) }, ['OK']),
          h('button', { class: 'btn_1', onclick: () => cancelInline() }, ['取消']),
        );
        list.append(h('li', { class: 'list_1__item' }, children));
        continue;
      }

      if (e.type === 'file') {
        const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
        cb.checked = state.remoteSelection.has(e.path);
        cb.addEventListener('change', () => {
          state.remoteSelection = toggleSelection(state.remoteSelection, e.path);
        });
        children.push(cb);
      }
      children.push(
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
      );
      if (e.type === 'file') {
        children.push(h('button', { class: 'btn_1', onclick: () => void downloadFile(e.path) }, ['DL']));
      }
      if (protocol && isActionAvailable(protocol, 'rename')) {
        children.push(h('button', { class: 'btn_1', onclick: () => startRename(e.path) }, ['改名']));
      }
      if (e.type === 'file' && protocol && isActionAvailable(protocol, 'chmod')) {
        children.push(h('button', { class: 'btn_1', onclick: () => startChmod(e.path) }, ['権限']));
      }
      children.push(h('button', { class: 'btn_1', onclick: () => void doDelete(e) }, [t('btn.delete')]));

      const selected = e.type === 'file' && e.path === state.selectedRemote;
      list.append(h('li', { class: `list_1__item${selected ? ' is_active' : ''}` }, children));
    }
    remotePanel.append(list);
    remotePanel.append(
      h('button', { class: 'btn_1', onclick: () => void enqueueSelectedDownloads() }, [
        '選択をキューにダウンロード',
      ]),
      renderBookmarks(),
    );
  }

  // ---- bookmarks ------------------------------------------------------------
  async function refreshBookmarks(): Promise<void> {
    if (!state.currentProfileId) {
      state.bookmarks = [];
      return;
    }
    state.bookmarks = (await api.listBookmarks(state.currentProfileId)) ?? [];
  }

  function renderBookmarks(): HTMLElement {
    const nameIn = h('input', {
      class: 'form_1__input',
      type: 'text',
      value: state.bookmarkName,
      placeholder: t('bookmark.namePrompt'),
    }) as HTMLInputElement;
    nameIn.addEventListener('input', () => {
      state.bookmarkName = nameIn.value;
    });

    return h('div', { class: 'bookmark_wrap_1' }, [
      h('h3', {}, [t('panel.bookmarks')]),
      h('div', { class: 'browser_1__tools' }, [
        nameIn,
        h('button', { class: 'btn_1', onclick: () => void addBookmark() }, [t('btn.addBookmark')]),
      ]),
      createBookmarkView(state.bookmarks, {
        onOpen: (b) => void loadRemote(b.remotePath),
        onRemove: (b) => void removeBookmark(b.id),
      }),
    ]);
  }

  async function addBookmark(): Promise<void> {
    if (!state.currentProfileId) {
      setStatus('先にプロファイルへ接続してください', true);
      return;
    }
    const name = state.bookmarkName.trim() || basename(state.remoteDir) || state.remoteDir;
    const ok = await guard('ブックマーク追加', () =>
      api.addBookmark({
        id: `bm${Date.now()}-${bookmarkSeq++}`,
        profileId: state.currentProfileId as string,
        name,
        remotePath: state.remoteDir,
      }),
    );
    if (!ok) return;
    state.bookmarkName = '';
    await refreshBookmarks();
    renderRemote();
  }

  async function removeBookmark(id: string): Promise<void> {
    const ok = await guardOk('ブックマーク削除', () => api.removeBookmark(id));
    if (!ok) return;
    await refreshBookmarks();
    renderRemote();
  }

  function startRename(path: string): void {
    state.renamingPath = path;
    state.chmodPath = null;
    renderRemote();
  }

  function startChmod(path: string): void {
    state.chmodPath = path;
    state.renamingPath = null;
    renderRemote();
  }

  function cancelInline(): void {
    state.renamingPath = null;
    state.chmodPath = null;
    renderRemote();
  }

  async function doRename(oldPath: string, newName: string): Promise<void> {
    if (!state.currentProfileId || newName.trim() === '') {
      cancelInline();
      return;
    }
    const to = joinRemote(parentDir(oldPath), newName.trim());
    const ok = await guardOk('リネーム', () =>
      api.renameRemote(state.currentProfileId as string, oldPath, to),
    );
    state.renamingPath = null;
    if (ok) await loadRemote(state.remoteDir);
    else renderRemote();
  }

  async function doChmod(path: string, modeStr: string): Promise<void> {
    if (!state.currentProfileId) return;
    const mode = parseMode(modeStr.trim());
    if (mode === null) {
      setStatus('不正なパーミッション（例: 644 / 755）', true);
      return;
    }
    const ok = await guardOk('パーミッション変更', () =>
      api.chmodRemote(state.currentProfileId as string, path, mode),
    );
    state.chmodPath = null;
    if (ok) await loadRemote(state.remoteDir);
    else renderRemote();
  }

  async function doDelete(entry: RemoteEntry): Promise<void> {
    if (!state.currentProfileId) return;
    const check = confirmDeletion([entry]);
    if (check.requiresConfirm && !window.confirm(check.message)) return;
    const ok = await guardOk('削除', () =>
      api.deleteRemote(state.currentProfileId as string, entry.path),
    );
    if (ok) await loadRemote(state.remoteDir);
  }

  async function enqueueSelectedDownloads(): Promise<void> {
    if (!state.currentProfileId) {
      setStatus('先にプロファイルへ接続してください', true);
      return;
    }
    const paths = [...state.remoteSelection];
    if (paths.length === 0) {
      setStatus('ダウンロードするファイルを選択してください', true);
      return;
    }
    const dir = state.localDir || (await api.homeDir());
    for (const remotePath of paths) {
      const name = basename(remotePath);
      await api.enqueueTransfer({
        kind: 'download',
        profileId: state.currentProfileId,
        remotePath,
        savePath: `${dir.replace(/[\\/]+$/, '')}/${name}`,
        label: name,
      });
    }
    setStatus(`${paths.length}件をダウンロードキューに追加しました`);
    await refreshQueue();
  }

  function handleOsDrop(files: FileList): void {
    if (!state.currentProfileId) {
      setStatus('先にプロファイルへ接続してください', true);
      return;
    }
    const items: DroppedItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const path = api.getPathForFile(files[i]);
      if (path) items.push({ path, isDirectory: false });
    }
    if (items.length === 0) return;
    const targets = resolveDropTargets(items, state.remoteDir);
    const requests = buildRequestsFromDropTargets(state.currentProfileId, targets);
    void (async () => {
      for (const req of requests) await api.enqueueTransfer(req);
      setStatus(`${requests.length}件をドロップからキューに追加しました`);
      await refreshQueue();
    })();
  }

  // ---- transfer / diff ------------------------------------------------------
  function renderTransfer(): void {
    transferPanel.replaceChildren();
    transferPanel.append(h('h2', {}, [t('panel.upload')]));

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

    const verifyChk = h('input', { type: 'checkbox' }) as HTMLInputElement;
    verifyChk.checked = state.verifyAfterTransfer;
    verifyChk.addEventListener('change', () => {
      state.verifyAfterTransfer = verifyChk.checked;
    });

    transferPanel.append(
      localLabel,
      pickBtn,
      h('label', {}, ['先: ', remoteIn]),
      h('label', {}, [verifyChk, ' 転送後にチェックサム検証']),
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
      api.commitUpload(state.currentProfileId as string, state.selectedLocal as string, remotePath, {
        verifyAfterTransfer: state.verifyAfterTransfer,
      }),
    );
    if (r) {
      setStatus(
        `アップロード完了: ${r.bytesWritten}B` +
          (r.verified ? ' / 検証OK' : '') +
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
    backupPanel.append(h('h2', {}, [t('panel.backups')]), h('div', {}, [remotePath]));
    if (backups.length === 0) {
      backupPanel.append(h('div', {}, ['履歴なし']));
      return;
    }
    const list = h('ul', { class: 'list_1' });
    for (const b of backups) {
      const ts = new Date(b.timestamp);
      list.append(
        h('li', { class: 'list_1__item' }, [
          h('span', { class: 'list_1__label' }, [`${ts.toLocaleString()}（${b.size}B）`]),
          h(
            'button',
            { class: 'btn_1', onclick: () => void restoreBackup(remotePath, ts, b.size) },
            ['復元'],
          ),
        ]),
      );
    }
    backupPanel.append(list);
  }

  async function restoreBackup(remotePath: string, timestamp: Date, size: number): Promise<void> {
    if (!state.currentProfileId) return;
    // 復元も上書き。世代日時とサイズを提示して確認を取る。
    const check = confirmRestore(remotePath, { timestamp, size });
    if (check.requiresConfirm && !window.confirm(check.message)) return;
    const r = await guard('復元', () =>
      api.restoreBackup(state.currentProfileId as string, remotePath, timestamp),
    );
    if (r) {
      setStatus(
        `復元完了: ${r.bytesWritten}B をリモートへ書き戻し` +
          (r.backupPath ? ` / 復元前バックアップ: ${r.backupPath}` : ' / 復元前バックアップなし（新規）'),
      );
      await loadRemote(state.remoteDir);
      await loadBackups(remotePath);
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
      h('option', { value: 'checksum' }, ['チェックサム（厳密・低速）']),
    ]) as HTMLSelectElement;
    const delChk = h('input', { type: 'checkbox' }) as HTMLInputElement;

    const opts = (): SyncFolderOptions => ({
      compareBy: compareSel.value as CompareBy,
      deleteExtraneous: delChk.checked,
    });

    syncPanel.append(
      h('h2', {}, [t('panel.sync')]),
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
        ['同期実行（プラン確認あり）'],
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

  /** 同期先の妥当性を確認する。error は中止、warn は確認を取る。 */
  function checkSyncDestination(remoteDir: string, options: SyncFolderOptions): boolean {
    const check = validateSyncDestination(remoteDir, {
      deleteExtraneous: options.deleteExtraneous,
    });
    if (!check.ok) {
      setStatus(check.message, true);
      return false;
    }
    if (check.level === 'warn' && !window.confirm(check.message)) return false;
    return true;
  }

  async function planSyncNow(
    remoteDir: string,
    options: SyncFolderOptions,
  ): Promise<PrepareSyncResult | undefined> {
    if (!state.currentProfileId || !state.syncLocalDir) {
      setStatus('プロファイルとローカルフォルダが必要です', true);
      return undefined;
    }
    const r = await guard('同期プラン作成', () =>
      api.prepareSync(state.currentProfileId as string, state.syncLocalDir as string, remoteDir, options),
    );
    syncPlanPanel.replaceChildren();
    if (r) syncPlanPanel.append(createSyncPlanView(r.plan, r.summary));
    return r;
  }

  /**
   * 実行前に必ずプランを作成・表示し、内容を確認させてから同期する。
   * ミラー削除が含まれる場合は削除件数と対象を提示する強い確認を必須にする。
   */
  async function confirmSyncPlan(
    remoteDir: string,
    options: SyncFolderOptions,
  ): Promise<boolean> {
    if (!checkSyncDestination(remoteDir, options)) return false;
    const prepared = await planSyncNow(remoteDir, options);
    if (!prepared) return false;

    const deletion = confirmMirrorDeletion(prepared.plan, remoteDir);
    if (deletion.requiresConfirm) {
      if (!window.confirm(deletion.message)) {
        setStatus('同期を中止しました');
        return false;
      }
      return true;
    }

    const s = prepared.summary;
    const ok = window.confirm(
      `「${remoteDir}」へ同期します（アップロード ${s.upload} / 新規dir ${s.createDir} / スキップ ${s.skip}）。実行してよろしいですか？`,
    );
    if (!ok) setStatus('同期を中止しました');
    return ok;
  }

  async function runSyncNow(remoteDir: string, options: SyncFolderOptions): Promise<void> {
    if (!state.currentProfileId || !state.syncLocalDir) {
      setStatus('プロファイルとローカルフォルダが必要です', true);
      return;
    }
    if (!(await confirmSyncPlan(remoteDir, options))) return;

    const r = await guard('同期実行', () =>
      api.commitSync(state.currentProfileId as string, state.syncLocalDir as string, remoteDir, options),
    );
    if (r) {
      const s = r.result;
      setStatus(
        `同期${s.canceled ? '中断' : '完了'}: up ${s.uploaded} / dir ${s.createdDirs} / skip ${s.skipped} / del ${s.deleted}`,
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
    // キュー経由でも同じプレビュー＋確認を通す（無確認のミラー削除を作らない）。
    if (!(await confirmSyncPlan(remoteDir, options))) return;
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
    queuePanel.append(h('h2', {}, [t('panel.queue')]));

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
      h('div', { class: 'queue_1__hint' }, [
        '未着手タスクは即時キャンセルされます。実行中の同期は次のファイルへ進まずに停止しますが、書き込み中のファイル 1 件は完了します。',
      ]),
    );
  }

  // ---- history --------------------------------------------------------------
  async function refreshHistory(): Promise<void> {
    const entries = await api.historyList(state.historyFilter);
    renderHistory(entries);
  }

  function renderHistory(entries: Parameters<typeof createHistoryView>[0]): void {
    historyPanel.replaceChildren();

    const kindSel = h('select', { class: 'form_1__input' }, [
      h('option', { value: '' }, ['種別: すべて']),
      ...(['upload', 'download', 'sync', 'rename', 'delete', 'chmod'] as HistoryKind[]).map((k) =>
        h('option', { value: k }, [k]),
      ),
    ]) as HTMLSelectElement;
    kindSel.value = state.historyFilter.kind ?? '';
    kindSel.addEventListener('change', () => {
      state.historyFilter = { ...state.historyFilter, kind: (kindSel.value || undefined) as HistoryKind | undefined };
      void refreshHistory();
    });

    const statusSel = h('select', { class: 'form_1__input' }, [
      h('option', { value: '' }, ['状態: すべて']),
      h('option', { value: 'success' }, ['success']),
      h('option', { value: 'failed' }, ['failed']),
    ]) as HTMLSelectElement;
    statusSel.value = state.historyFilter.status ?? '';
    statusSel.addEventListener('change', () => {
      state.historyFilter = {
        ...state.historyFilter,
        status: (statusSel.value || undefined) as HistoryStatus | undefined,
      };
      void refreshHistory();
    });

    const clearBtn = h(
      'button',
      {
        class: 'btn_1',
        onclick: () => {
          void api.historyClear().then(() => refreshHistory());
        },
      },
      ['履歴クリア'],
    );

    historyPanel.append(
      h('h2', {}, [t('panel.history')]),
      h('div', { class: 'browser_1__tools' }, [kindSel, statusSel, clearBtn]),
      createHistoryView(entries),
    );
  }

  // ---- boot -----------------------------------------------------------------
  const hiddenChk = h('input', { type: 'checkbox' }) as HTMLInputElement;
  hiddenChk.checked = state.showHidden;
  hiddenChk.addEventListener('change', () => {
    state.showHidden = hiddenChk.checked;
    renderLocal();
    renderRemote();
  });

  const langSel = h(
    'select',
    { class: 'form_1__input' },
    LOCALES.map((l) => h('option', { value: l }, [l])),
  ) as HTMLSelectElement;
  langSel.value = locale;
  langSel.addEventListener('change', () => {
    window.localStorage.setItem('sftps.locale', langSel.value);
    window.location.reload();
  });

  let themeSetting = normalizeThemeSetting(window.localStorage.getItem('sftps.theme'));
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refreshTheme = (): void => {
    applyTheme(document.documentElement, themeSetting, media.matches);
  };
  refreshTheme();
  media.addEventListener('change', refreshTheme);

  const themeSel = h(
    'select',
    { class: 'form_1__input' },
    THEME_SETTINGS.map((s) => h('option', { value: s }, [s])),
  ) as HTMLSelectElement;
  themeSel.value = themeSetting;
  themeSel.addEventListener('change', () => {
    themeSetting = themeSel.value as ThemeSetting;
    window.localStorage.setItem('sftps.theme', themeSetting);
    refreshTheme();
  });

  container.replaceChildren(
    h('header', { class: 'header_1' }, [
      h('h1', {}, [t('app.title')]),
      h('div', { class: 'header_1__controls' }, [
        h('label', { class: 'header_1__toggle' }, [hiddenChk, ` ${t('header.showHidden')}`]),
        h('label', { class: 'header_1__toggle' }, [`${t('header.theme')}: `, themeSel]),
        h('label', { class: 'header_1__toggle' }, [`${t('header.language')}: `, langSel]),
      ]),
    ]),
    secretWarn,
    h('main', { class: 'layout_1' }, [
      h('section', { class: 'layout_1__col' }, [profilePanel, knownHostsPanel]),
      h('section', { class: 'layout_1__col' }, [localPanel, remotePanel]),
      h('section', { class: 'layout_1__col' }, [
        transferPanel,
        syncPanel,
        backupPanel,
        queuePanel,
        historyPanel,
      ]),
    ]),
    statusBar,
  );

  attachDropZone(remotePanel, handleOsDrop);

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
    await refreshKnownHosts();
    renderTransfer();
    renderSync();
    await refreshQueue();
    await refreshHistory();
    window.setInterval(() => {
      void refreshQueue();
      void refreshHistory();
    }, 1500);
  })();
}
