import type { PlanSummary, SyncAction } from '../core/sync/index';

/** 同期プランを一覧表示する DOM を生成する純粋関数。 */
export function createSyncPlanView(plan: SyncAction[], summary: PlanSummary): HTMLElement {
  const root = document.createElement('div');
  root.className = 'sync_1';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'sync_1__summary';
  summaryEl.textContent =
    `アップロード ${summary.upload} / 新規dir ${summary.createDir} / ` +
    `スキップ ${summary.skip} / 削除 ${summary.deleteExtra}`;
  root.appendChild(summaryEl);

  const list = document.createElement('ul');
  list.className = 'sync_1__list';
  for (const action of plan) {
    const item = document.createElement('li');
    const state = `is_${action.type.replace(/-/g, '_')}`;
    item.className = `sync_1__item ${state}`;
    item.textContent = `${action.type}  ${action.path}  (${action.reason})`;
    list.appendChild(item);
  }
  root.appendChild(list);
  return root;
}
