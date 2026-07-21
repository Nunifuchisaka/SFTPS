import type { KnownHostEntry } from '../core/hostkey/index';

export interface KnownHostsViewLabels {
  /** 信頼取り消しボタンの文言。 */
  remove: string;
  /** 1件も無いときの文言。 */
  empty: string;
}

export interface KnownHostsViewHandlers {
  onRemove: (entry: KnownHostEntry) => void;
  labels: KnownHostsViewLabels;
}

/** 信頼済みホスト鍵の一覧から表示用の DOM を生成する純粋関数。 */
export function createKnownHostsView(
  entries: KnownHostEntry[],
  handlers: KnownHostsViewHandlers,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'knownhosts_1';

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'knownhosts_1__empty';
    empty.textContent = handlers.labels.empty;
    root.appendChild(empty);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'knownhosts_1__list';
  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'knownhosts_1__item';

    const label = document.createElement('span');
    label.className = 'knownhosts_1__label';
    label.textContent = `${entry.host}:${entry.port} — ${entry.fingerprint}`;

    const remove = document.createElement('button');
    remove.className = 'btn_1 js_knownhost_remove';
    remove.type = 'button';
    remove.textContent = handlers.labels.remove;
    remove.addEventListener('click', () => handlers.onRemove(entry));

    li.append(label, remove);
    list.appendChild(li);
  }
  root.appendChild(list);
  return root;
}
