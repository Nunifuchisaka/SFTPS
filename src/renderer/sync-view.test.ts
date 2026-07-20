// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { SyncAction } from '../core/sync/index';
import { createSyncPlanView } from './sync-view';

const plan: SyncAction[] = [
  { type: 'upload', path: 'a.txt', reason: 'new' },
  { type: 'create-dir', path: 'sub', reason: 'missing dir' },
  { type: 'skip', path: 'b.txt', reason: 'unchanged' },
  { type: 'delete-extra', path: 'old.txt', reason: 'extraneous' },
];
const summary = { upload: 1, createDir: 1, skip: 1, deleteExtra: 1 };

describe('createSyncPlanView', () => {
  it('renders one row per action with a state class per type', () => {
    const el = createSyncPlanView(plan, summary);
    const items = el.querySelectorAll('.sync_1__item');
    expect(items).toHaveLength(4);
    expect(items[0].className).toContain('is_upload');
    expect(items[0].textContent).toContain('a.txt');
    expect(items[1].className).toContain('is_create_dir');
    expect(items[3].className).toContain('is_delete_extra');
  });

  it('renders a summary line with the counts', () => {
    const el = createSyncPlanView(plan, summary);
    const text = el.querySelector('.sync_1__summary')?.textContent ?? '';
    expect(text).toContain('1');
  });
});
