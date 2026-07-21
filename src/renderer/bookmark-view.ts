import type { Bookmark } from '../core/bookmark/index';

export interface BookmarkViewHandlers {
  /** 行のラベルクリック（そのリモートパスへ移動）。 */
  onOpen: (bookmark: Bookmark) => void;
  /** 削除ボタンクリック。 */
  onRemove: (bookmark: Bookmark) => void;
}

/** ブックマーク一覧（追加順の配列）から表示用の DOM を生成する純粋関数。 */
export function createBookmarkView(
  bookmarks: Bookmark[],
  handlers: BookmarkViewHandlers,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'bookmark_1';

  if (bookmarks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bookmark_1__empty';
    empty.textContent = 'ブックマークはありません';
    root.appendChild(empty);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'bookmark_1__list';
  for (const b of bookmarks) {
    const li = document.createElement('li');
    li.className = 'bookmark_1__item';

    const label = document.createElement('button');
    label.className = 'btn_1 bookmark_1__label js_bookmark_open';
    label.type = 'button';
    label.title = b.remotePath;
    label.textContent = `★ ${b.name} — ${b.remotePath}`;
    label.addEventListener('click', () => handlers.onOpen(b));

    const remove = document.createElement('button');
    remove.className = 'btn_1 js_bookmark_remove';
    remove.type = 'button';
    remove.textContent = '削除';
    remove.addEventListener('click', () => handlers.onRemove(b));

    li.append(label, remove);
    list.appendChild(li);
  }
  root.appendChild(list);
  return root;
}
