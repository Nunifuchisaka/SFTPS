import type { Profile } from '../core/profile/index';
import { profilesInGroup, resolveDropSide, sortFolders, type ProfileFolder } from '../core/profile-folder/index';
import { PROFILE_DRAG_MIME, PROFILE_FOLDER_DRAG_MIME } from './dnd';

export interface ProfileListLabels {
  connect: string;
  edit: string;
  delete: string;
  unfiled: string;
  addFolder: string;
  folderNamePlaceholder: string;
  renameFolder: string;
  deleteFolder: string;
  empty: string;
}

export interface ProfileListHandlers {
  currentProfileId: string | null;
  /** 折りたたみ中のフォルダ id 集合（開閉状態は呼び出し側が保持する）。 */
  collapsedFolderIds: ReadonlySet<string>;
  labels: ProfileListLabels;
  onConnect(profile: Profile): void;
  onEdit(profile: Profile): void;
  onDelete(profile: Profile): void;
  onToggleCollapse(folderId: string): void;
  onAddFolder(name: string): void;
  onRenameFolder(folder: ProfileFolder): void;
  onDeleteFolder(folder: ProfileFolder): void;
  /** プロファイルをドラッグ&ドロップで targetFolderId グループの targetIndex 位置へ移動する。 */
  onMoveProfile(profileId: string, targetFolderId: string | null, targetIndex: number): void;
  /** フォルダをドラッグ&ドロップで targetIndex 位置へ移動する。 */
  onMoveFolder(folderId: string, targetIndex: number): void;
}

function labelOf(p: Profile): string {
  return `${p.name} [${p.protocol}]`;
}

/**
 * プロファイル一覧（サイト情報）を、フォルダ分け・ドラッグ&ドロップ並び替え付きで描画する純粋関数。
 * 折りたたみ状態や「新規フォルダ名」入力欄の値のような一時 UI 状態は持たず、
 * 呼び出し側（app.ts）の再描画のたびに作り直される前提（他パネルと同じ設計）。
 */
export function createProfileListView(
  profiles: Profile[],
  folders: ProfileFolder[],
  handlers: ProfileListHandlers,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'profile_list_1';

  // ドラッグ中のハイライトは同時に1要素だけ有効にする（子要素通過の depth 計算を避けるための簡易実装）。
  let highlighted: HTMLElement | null = null;
  function setHighlight(el: HTMLElement | null): void {
    if (highlighted && highlighted !== el) highlighted.classList.remove('is_dragover');
    highlighted = el;
    if (el) el.classList.add('is_dragover');
  }
  root.addEventListener('dragend', () => setHighlight(null));

  function hasType(ev: DragEvent, mime: string): boolean {
    const types = ev.dataTransfer?.types;
    return !!types && Array.from(types).includes(mime);
  }

  function buildProfileRow(profile: Profile, group: Profile[], groupFolderId: string | null): HTMLElement {
    const li = document.createElement('li');
    li.className = `list_1__item profile_list_1__item${profile.id === handlers.currentProfileId ? ' is_active' : ''}`;
    li.draggable = true;

    const label = document.createElement('span');
    label.className = 'list_1__label js_profile_connect';
    label.textContent = labelOf(profile);
    label.addEventListener('click', () => handlers.onConnect(profile));

    const editBtn = document.createElement('button');
    editBtn.className = 'btn_1 js_profile_edit';
    editBtn.type = 'button';
    editBtn.textContent = handlers.labels.edit;
    editBtn.addEventListener('click', () => handlers.onEdit(profile));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn_1 js_profile_delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = handlers.labels.delete;
    deleteBtn.addEventListener('click', () => handlers.onDelete(profile));

    li.append(label, editBtn, deleteBtn);

    li.addEventListener('dragstart', (ev) => {
      ev.dataTransfer?.setData(PROFILE_DRAG_MIME, JSON.stringify({ id: profile.id }));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragover', (ev) => {
      if (!hasType(ev, PROFILE_DRAG_MIME)) return;
      ev.preventDefault();
      ev.stopPropagation();
      setHighlight(li);
    });
    li.addEventListener('drop', (ev) => {
      const data = ev.dataTransfer?.getData(PROFILE_DRAG_MIME);
      if (!data) return;
      ev.preventDefault();
      ev.stopPropagation();
      setHighlight(null);
      const draggedId = (JSON.parse(data) as { id: string }).id;
      if (draggedId === profile.id) return;
      const filtered = group.filter((p) => p.id !== draggedId);
      const idx = filtered.findIndex((p) => p.id === profile.id);
      const rect = li.getBoundingClientRect();
      const side = resolveDropSide(rect.top, rect.height, ev.clientY);
      const targetIndex = side === 'before' ? idx : idx + 1;
      handlers.onMoveProfile(draggedId, groupFolderId, targetIndex);
    });

    return li;
  }

  function buildItemsList(group: Profile[], groupFolderId: string | null): HTMLElement {
    const ul = document.createElement('ul');
    ul.className = 'list_1 profile_list_1__items';
    for (const p of group) ul.append(buildProfileRow(p, group, groupFolderId));

    // 空の余白／行の隙間へのドロップも「末尾へ追加」として受け付ける。
    ul.addEventListener('dragover', (ev) => {
      if (!hasType(ev, PROFILE_DRAG_MIME)) return;
      ev.preventDefault();
      setHighlight(ul);
    });
    ul.addEventListener('drop', (ev) => {
      const data = ev.dataTransfer?.getData(PROFILE_DRAG_MIME);
      if (!data) return;
      ev.preventDefault();
      setHighlight(null);
      const draggedId = (JSON.parse(data) as { id: string }).id;
      const targetIndex = group.filter((p) => p.id !== draggedId).length;
      handlers.onMoveProfile(draggedId, groupFolderId, targetIndex);
    });
    return ul;
  }

  function buildFolderHeader(folder: ProfileFolder, sortedFolders: ProfileFolder[], count: number): HTMLElement {
    const collapsed = handlers.collapsedFolderIds.has(folder.id);
    const header = document.createElement('div');
    header.className = 'profile_list_1__folder_header';
    header.draggable = true;

    const toggle = document.createElement('button');
    toggle.className = 'btn_1 profile_list_1__collapse js_folder_toggle';
    toggle.type = 'button';
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.addEventListener('click', () => handlers.onToggleCollapse(folder.id));

    const label = document.createElement('span');
    label.className = 'profile_list_1__folder_label';
    label.textContent = `📁 ${folder.name} (${count})`;

    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn_1 js_folder_rename';
    renameBtn.type = 'button';
    renameBtn.textContent = handlers.labels.renameFolder;
    renameBtn.addEventListener('click', () => handlers.onRenameFolder(folder));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn_1 js_folder_delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = handlers.labels.deleteFolder;
    deleteBtn.addEventListener('click', () => handlers.onDeleteFolder(folder));

    header.append(toggle, label, renameBtn, deleteBtn);

    header.addEventListener('dragstart', (ev) => {
      ev.dataTransfer?.setData(PROFILE_FOLDER_DRAG_MIME, JSON.stringify({ id: folder.id }));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    });
    header.addEventListener('dragover', (ev) => {
      if (!hasType(ev, PROFILE_DRAG_MIME) && !hasType(ev, PROFILE_FOLDER_DRAG_MIME)) return;
      ev.preventDefault();
      ev.stopPropagation();
      setHighlight(header);
    });
    header.addEventListener('drop', (ev) => {
      ev.stopPropagation();
      const profileData = ev.dataTransfer?.getData(PROFILE_DRAG_MIME);
      if (profileData) {
        ev.preventDefault();
        setHighlight(null);
        const draggedId = (JSON.parse(profileData) as { id: string }).id;
        const targetIndex = profilesInGroup(profiles, folder.id).filter((p) => p.id !== draggedId).length;
        handlers.onMoveProfile(draggedId, folder.id, targetIndex);
        return;
      }
      const folderData = ev.dataTransfer?.getData(PROFILE_FOLDER_DRAG_MIME);
      if (!folderData) return;
      ev.preventDefault();
      setHighlight(null);
      const draggedId = (JSON.parse(folderData) as { id: string }).id;
      if (draggedId === folder.id) return;
      const filtered = sortedFolders.filter((f) => f.id !== draggedId);
      const idx = filtered.findIndex((f) => f.id === folder.id);
      const rect = header.getBoundingClientRect();
      const side = resolveDropSide(rect.top, rect.height, ev.clientY);
      handlers.onMoveFolder(draggedId, side === 'before' ? idx : idx + 1);
    });

    return header;
  }

  // ---- フォルダ追加ツールバー ----
  const toolbar = document.createElement('div');
  toolbar.className = 'browser_1__tools profile_list_1__toolbar';
  const nameInput = document.createElement('input');
  nameInput.className = 'form_1__input';
  nameInput.type = 'text';
  nameInput.placeholder = handlers.labels.folderNamePlaceholder;
  const addBtn = document.createElement('button');
  addBtn.className = 'btn_1';
  addBtn.type = 'button';
  addBtn.textContent = handlers.labels.addFolder;
  addBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name === '') return;
    handlers.onAddFolder(name);
  });
  toolbar.append(nameInput, addBtn);
  root.append(toolbar);

  if (profiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'profile_list_1__empty';
    empty.textContent = handlers.labels.empty;
    root.append(empty);
    return root;
  }

  // ---- フォルダ ----
  const sortedFolders = sortFolders(folders);
  const folderList = document.createElement('ul');
  folderList.className = 'profile_list_1__folders';
  for (const folder of sortedFolders) {
    const group = profilesInGroup(profiles, folder.id);
    const li = document.createElement('li');
    li.className = 'profile_list_1__folder';
    li.append(buildFolderHeader(folder, sortedFolders, group.length));
    if (!handlers.collapsedFolderIds.has(folder.id)) {
      li.append(buildItemsList(group, folder.id));
    }
    folderList.append(li);
  }
  root.append(folderList);

  // ---- 未整理 ----
  const unfiled = profilesInGroup(profiles, null);
  const unfiledWrap = document.createElement('div');
  unfiledWrap.className = 'profile_list_1__unfiled';
  const unfiledHeader = document.createElement('div');
  unfiledHeader.className = 'profile_list_1__folder_header profile_list_1__unfiled_header';
  unfiledHeader.textContent = `${handlers.labels.unfiled} (${unfiled.length})`;
  unfiledHeader.addEventListener('dragover', (ev) => {
    if (!hasType(ev, PROFILE_DRAG_MIME)) return;
    ev.preventDefault();
    setHighlight(unfiledHeader);
  });
  unfiledHeader.addEventListener('drop', (ev) => {
    const data = ev.dataTransfer?.getData(PROFILE_DRAG_MIME);
    if (!data) return;
    ev.preventDefault();
    setHighlight(null);
    const draggedId = (JSON.parse(data) as { id: string }).id;
    const targetIndex = unfiled.filter((p) => p.id !== draggedId).length;
    handlers.onMoveProfile(draggedId, null, targetIndex);
  });
  unfiledWrap.append(unfiledHeader, buildItemsList(unfiled, null));
  root.append(unfiledWrap);

  return root;
}
