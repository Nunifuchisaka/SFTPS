export interface ReleaseDialogData {
  repoRoot: string;
  files: string[];
  deletedFiles: string[];
}

export interface ReleaseDialogLabels {
  /** ACMR 対象が 0 件のときの表示文言。 */
  noChanges: string;
  /** 削除ファイル警告の見出し文言。 */
  deletedWarning: string;
  createZip: string;
  cancel: string;
}

export interface ReleaseDialogHandlers {
  labels: ReleaseDialogLabels;
  /** 「zip作成」クリック時、チェックが入ったファイルのみを渡す。 */
  onCreateZip: (selectedFiles: string[]) => void;
  onCancel: () => void;
}

/**
 * 差分納品ファイル抽出のプレビューダイアログを生成する純粋関数。
 * ACMR 対象はチェックボックス付き（既定全選択）、D 対象は別枠の警告として表示する。
 */
export function createReleaseDialogView(
  data: ReleaseDialogData,
  handlers: ReleaseDialogHandlers,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'release_1';

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'btn_1 btn_1--primary js_release_1_create';
  createBtn.textContent = handlers.labels.createZip;

  if (data.files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'release_1__empty';
    empty.textContent = handlers.labels.noChanges;
    root.appendChild(empty);
    createBtn.disabled = true;
  } else {
    const list = document.createElement('ul');
    list.className = 'release_1__list';
    for (const file of data.files) {
      const item = document.createElement('li');
      item.className = 'release_1__item';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.className = 'js_release_1_checkbox';
      checkbox.dataset['path'] = file;
      label.append(checkbox, ` ${file}`);
      item.appendChild(label);
      list.appendChild(item);
    }
    root.appendChild(list);

    createBtn.addEventListener('click', () => {
      const selected = [...list.querySelectorAll<HTMLInputElement>('.js_release_1_checkbox:checked')]
        .map((box) => box.dataset['path'])
        .filter((path): path is string => path !== undefined);
      handlers.onCreateZip(selected);
    });
  }

  if (data.deletedFiles.length > 0) {
    const warn = document.createElement('div');
    warn.className = 'release_1__deleted warn_1';
    const title = document.createElement('div');
    title.className = 'release_1__deletedtitle';
    title.textContent = handlers.labels.deletedWarning;
    warn.appendChild(title);
    const list = document.createElement('ul');
    list.className = 'release_1__deletedlist';
    for (const file of data.deletedFiles) {
      const item = document.createElement('li');
      item.textContent = file;
      list.appendChild(item);
    }
    warn.appendChild(list);
    root.appendChild(warn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn_1 js_release_1_cancel';
  cancelBtn.textContent = handlers.labels.cancel;
  cancelBtn.addEventListener('click', () => handlers.onCancel());

  const actions = document.createElement('div');
  actions.className = 'release_1__actions';
  actions.append(cancelBtn, createBtn);
  root.appendChild(actions);

  return root;
}
