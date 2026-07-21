import type { HistoryEntry } from '../core/history/index';

/** 転送履歴（新しい順の配列）から表示用の DOM を生成する純粋関数。 */
export function createHistoryView(entries: HistoryEntry[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'history_1';

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history_1__empty';
    empty.textContent = '履歴はありません';
    root.appendChild(empty);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'history_1__list';
  for (const e of entries) {
    const li = document.createElement('li');
    li.className = `history_1__item is_${e.status}`;
    const time = new Date(e.timestamp).toLocaleString();
    const size = e.bytes !== undefined ? ` ${e.bytes}B` : '';
    const err = e.error ? ` - ${e.error}` : '';
    li.textContent = `${time} [${e.kind}] ${e.path} (${e.status}${size})${err}`;
    list.appendChild(li);
  }
  root.appendChild(list);
  return root;
}
