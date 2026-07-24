// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { FtpProfile } from '../core/profile/index';
import type { ProfileFolder } from '../core/profile-folder/index';
import { createProfileListView, type ProfileListHandlers } from './profile-list-view';
import { PROFILE_DRAG_MIME, PROFILE_FOLDER_DRAG_MIME } from './dnd';

function ftp(id: string, extra: Partial<FtpProfile> = {}): FtpProfile {
  return { id, name: id, protocol: 'ftp', host: 'h', port: 21, user: 'u', ...extra };
}

const labels: ProfileListHandlers['labels'] = {
  connect: '接続',
  edit: '編集',
  delete: '削除',
  unfiled: '未整理',
  addFolder: 'フォルダ追加',
  folderNamePlaceholder: 'フォルダ名',
  renameFolder: '名称変更',
  deleteFolder: 'フォルダ削除',
  empty: 'プロファイルはありません',
};

function makeHandlers(over: Partial<ProfileListHandlers> = {}): ProfileListHandlers {
  return {
    currentProfileId: null,
    collapsedFolderIds: new Set(),
    labels,
    onConnect: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleCollapse: vi.fn(),
    onAddFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onMoveProfile: vi.fn(),
    onMoveFolder: vi.fn(),
    ...over,
  };
}

/** dragover/drop 用の最小 dataTransfer を積んだイベントを作る（jsdom は DataTransfer 未実装のため）。 */
function dragEvent(
  type: string,
  opts: { types?: string[]; data?: Record<string, string>; clientY?: number } = {},
): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clientY', { value: opts.clientY ?? 0 });
  (ev as unknown as { dataTransfer: unknown }).dataTransfer = {
    types: opts.types ?? [],
    getData: (t: string) => opts.data?.[t] ?? '',
    setData: () => {},
  };
  return ev;
}

describe('createProfileListView', () => {
  it('shows the empty message when there are no profiles', () => {
    const el = createProfileListView([], [], makeHandlers());
    expect(el.querySelector('.profile_list_1__empty')?.textContent).toBe(labels.empty);
  });

  it('renders folders with their profile counts and an unfiled section', () => {
    const folders: ProfileFolder[] = [{ id: 'f1', name: 'Prod', order: 0 }];
    const profiles = [ftp('p1', { folderId: 'f1', order: 0 }), ftp('p2', { order: 0 })];
    const el = createProfileListView(profiles, folders, makeHandlers());

    expect(el.querySelector('.profile_list_1__folder_label')?.textContent).toContain('Prod (1)');
    expect(el.querySelector('.profile_list_1__unfiled_header')?.textContent).toContain('未整理 (1)');
    expect(el.querySelectorAll('.profile_list_1__item')).toHaveLength(2);
  });

  it('marks the connected profile as active', () => {
    const profiles = [ftp('p1'), ftp('p2')];
    const el = createProfileListView(profiles, [], makeHandlers({ currentProfileId: 'p2' }));
    const items = el.querySelectorAll('.profile_list_1__item');
    expect(items[0].classList.contains('is_active')).toBe(false);
    expect(items[1].classList.contains('is_active')).toBe(true);
  });

  it('calls onConnect / onEdit / onDelete with the clicked profile', () => {
    const profiles = [ftp('p1')];
    const onConnect = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const el = createProfileListView(profiles, [], makeHandlers({ onConnect, onEdit, onDelete }));

    (el.querySelector('.js_profile_connect') as HTMLElement).click();
    (el.querySelector('.js_profile_edit') as HTMLElement).click();
    (el.querySelector('.js_profile_delete') as HTMLElement).click();

    expect(onConnect).toHaveBeenCalledWith(profiles[0]);
    expect(onEdit).toHaveBeenCalledWith(profiles[0]);
    expect(onDelete).toHaveBeenCalledWith(profiles[0]);
  });

  it('hides a folder collapsed set from view and calls onToggleCollapse', () => {
    const folders: ProfileFolder[] = [{ id: 'f1', name: 'Prod', order: 0 }];
    const profiles = [ftp('p1', { folderId: 'f1', order: 0 })];
    const onToggleCollapse = vi.fn();
    const el = createProfileListView(
      profiles,
      folders,
      makeHandlers({ collapsedFolderIds: new Set(['f1']), onToggleCollapse }),
    );
    expect(el.querySelectorAll('.profile_list_1__folder .profile_list_1__items')).toHaveLength(0);
    (el.querySelector('.js_folder_toggle') as HTMLElement).click();
    expect(onToggleCollapse).toHaveBeenCalledWith('f1');
  });

  it('calls onAddFolder with the trimmed input value and ignores blank input', () => {
    const onAddFolder = vi.fn();
    const el = createProfileListView([ftp('p1')], [], makeHandlers({ onAddFolder }));
    const input = el.querySelector('.profile_list_1__toolbar input') as HTMLInputElement;
    const addBtn = el.querySelector('.profile_list_1__toolbar button') as HTMLElement;

    addBtn.click();
    expect(onAddFolder).not.toHaveBeenCalled();

    input.value = '  New Folder  ';
    addBtn.click();
    expect(onAddFolder).toHaveBeenCalledWith('New Folder');
  });

  it('calls onRenameFolder / onDeleteFolder with the folder', () => {
    const folders: ProfileFolder[] = [{ id: 'f1', name: 'Prod', order: 0 }];
    const onRenameFolder = vi.fn();
    const onDeleteFolder = vi.fn();
    const el = createProfileListView([ftp('p1')], folders, makeHandlers({ onRenameFolder, onDeleteFolder }));

    (el.querySelector('.js_folder_rename') as HTMLElement).click();
    (el.querySelector('.js_folder_delete') as HTMLElement).click();
    expect(onRenameFolder).toHaveBeenCalledWith(folders[0]);
    expect(onDeleteFolder).toHaveBeenCalledWith(folders[0]);
  });

  it('moves a profile before a sibling row within the same group on drop', () => {
    const profiles = [ftp('p1', { order: 0 }), ftp('p2', { order: 1 }), ftp('p3', { order: 2 })];
    const onMoveProfile = vi.fn();
    const el = createProfileListView(profiles, [], makeHandlers({ onMoveProfile }));
    const rows = el.querySelectorAll<HTMLElement>('.profile_list_1__item');
    Object.defineProperty(rows[2], 'getBoundingClientRect', { value: () => ({ top: 100, height: 40 }) });
    // p3 の行の上半分（中点120より上）にドロップ → p3 の直前（p1 を除くと index 1）に挿入。
    rows[2].dispatchEvent(
      dragEvent('drop', {
        types: [PROFILE_DRAG_MIME],
        data: { [PROFILE_DRAG_MIME]: JSON.stringify({ id: 'p1' }) },
        clientY: 90,
      }),
    );
    expect(onMoveProfile).toHaveBeenCalledWith('p1', null, 1);
  });

  it('moves a profile into a folder when dropped on the folder header', () => {
    const folders: ProfileFolder[] = [{ id: 'f1', name: 'Prod', order: 0 }];
    const profiles = [ftp('p1', { folderId: 'f1', order: 0 }), ftp('p2', { order: 0 })];
    const onMoveProfile = vi.fn();
    const el = createProfileListView(profiles, folders, makeHandlers({ onMoveProfile }));
    const header = el.querySelector('.profile_list_1__folder_header') as HTMLElement;

    header.dispatchEvent(
      dragEvent('drop', {
        types: [PROFILE_DRAG_MIME],
        data: { [PROFILE_DRAG_MIME]: JSON.stringify({ id: 'p2' }) },
      }),
    );
    expect(onMoveProfile).toHaveBeenCalledWith('p2', 'f1', 1);
  });

  it('moves a profile to the unfiled group when dropped on the unfiled header', () => {
    const folders: ProfileFolder[] = [{ id: 'f1', name: 'Prod', order: 0 }];
    const profiles = [ftp('p1', { folderId: 'f1', order: 0 })];
    const onMoveProfile = vi.fn();
    const el = createProfileListView(profiles, folders, makeHandlers({ onMoveProfile }));
    const unfiledHeader = el.querySelector('.profile_list_1__unfiled_header') as HTMLElement;

    unfiledHeader.dispatchEvent(
      dragEvent('drop', {
        types: [PROFILE_DRAG_MIME],
        data: { [PROFILE_DRAG_MIME]: JSON.stringify({ id: 'p1' }) },
      }),
    );
    expect(onMoveProfile).toHaveBeenCalledWith('p1', null, 0);
  });

  it('resolves a folder drop before the target row when the cursor is above its midpoint', () => {
    const folders: ProfileFolder[] = [
      { id: 'f1', name: 'A', order: 0 },
      { id: 'f2', name: 'B', order: 1 },
    ];
    const onMoveFolder = vi.fn();
    const el = createProfileListView([ftp('p1')], folders, makeHandlers({ onMoveFolder }));
    const headers = el.querySelectorAll<HTMLElement>('.profile_list_1__folder_header');
    Object.defineProperty(headers[1], 'getBoundingClientRect', { value: () => ({ top: 100, height: 40 }) });

    headers[1].dispatchEvent(
      dragEvent('drop', {
        types: [PROFILE_FOLDER_DRAG_MIME],
        data: { [PROFILE_FOLDER_DRAG_MIME]: JSON.stringify({ id: 'f1' }) },
        clientY: 110, // 中点(120)より上 → before
      }),
    );
    expect(onMoveFolder).toHaveBeenCalledWith('f1', 0);
  });

  it('resolves a folder drop after the target row when the cursor is below its midpoint', () => {
    const folders: ProfileFolder[] = [
      { id: 'f1', name: 'A', order: 0 },
      { id: 'f2', name: 'B', order: 1 },
    ];
    const onMoveFolder = vi.fn();
    const el = createProfileListView([ftp('p1')], folders, makeHandlers({ onMoveFolder }));
    const headers = el.querySelectorAll<HTMLElement>('.profile_list_1__folder_header');
    Object.defineProperty(headers[1], 'getBoundingClientRect', { value: () => ({ top: 100, height: 40 }) });

    headers[1].dispatchEvent(
      dragEvent('drop', {
        types: [PROFILE_FOLDER_DRAG_MIME],
        data: { [PROFILE_FOLDER_DRAG_MIME]: JSON.stringify({ id: 'f1' }) },
        clientY: 130, // 中点(120)より下 → after
      }),
    );
    expect(onMoveFolder).toHaveBeenCalledWith('f1', 1);
  });
});
