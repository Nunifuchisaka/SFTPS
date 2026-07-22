// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createReleaseDialogView } from './release-view';

const labels = {
  noChanges: '変更なし',
  deletedWarning: '以下のファイルはリモート側で手動削除が必要です',
  createZip: 'zip作成',
  cancel: 'キャンセル',
};

function noop(): void {}

describe('createReleaseDialogView', () => {
  it('renders one checkbox row per ACMR file, checked by default', () => {
    const el = createReleaseDialogView(
      { repoRoot: '/repo', files: ['a.ts', 'b.ts'], deletedFiles: [] },
      { labels, onCreateZip: noop, onCancel: noop },
    );
    const boxes = el.querySelectorAll<HTMLInputElement>('.js_release_1_checkbox');
    expect(boxes).toHaveLength(2);
    expect([...boxes].every((b) => b.checked)).toBe(true);
    expect(el.querySelector('.release_1__list')?.textContent).toContain('a.ts');
    expect(el.querySelector('.release_1__list')?.textContent).toContain('b.ts');
  });

  it('shows "変更なし" and disables the create button when there are no ACMR files', () => {
    const el = createReleaseDialogView(
      { repoRoot: '/repo', files: [], deletedFiles: [] },
      { labels, onCreateZip: noop, onCancel: noop },
    );
    expect(el.querySelector('.release_1__empty')?.textContent).toBe('変更なし');
    const createBtn = el.querySelector<HTMLButtonElement>('.js_release_1_create');
    expect(createBtn?.disabled).toBe(true);
  });

  it('shows a deletion warning listing files that need manual remote deletion', () => {
    const el = createReleaseDialogView(
      { repoRoot: '/repo', files: ['a.ts'], deletedFiles: ['old.ts', 'gone.ts'] },
      { labels, onCreateZip: noop, onCancel: noop },
    );
    const warn = el.querySelector('.release_1__deleted');
    expect(warn?.textContent).toContain('以下のファイルはリモート側で手動削除が必要です');
    expect(warn?.textContent).toContain('old.ts');
    expect(warn?.textContent).toContain('gone.ts');
  });

  it('does not show a deletion warning when there are no deleted files', () => {
    const el = createReleaseDialogView(
      { repoRoot: '/repo', files: ['a.ts'], deletedFiles: [] },
      { labels, onCreateZip: noop, onCancel: noop },
    );
    expect(el.querySelector('.release_1__deleted')).toBeNull();
  });

  it('calls onCreateZip with only the checked files when the create button is clicked', () => {
    const selected: string[][] = [];
    const el = createReleaseDialogView(
      { repoRoot: '/repo', files: ['a.ts', 'b.ts', 'c.ts'], deletedFiles: [] },
      { labels, onCreateZip: (files) => selected.push(files), onCancel: noop },
    );
    const boxes = [...el.querySelectorAll<HTMLInputElement>('.js_release_1_checkbox')];
    boxes[1].checked = false;
    el.querySelector<HTMLButtonElement>('.js_release_1_create')?.click();
    expect(selected).toEqual([['a.ts', 'c.ts']]);
  });

  it('calls onCancel when the cancel button is clicked', () => {
    let canceled = false;
    const el = createReleaseDialogView(
      { repoRoot: '/repo', files: ['a.ts'], deletedFiles: [] },
      { labels, onCreateZip: noop, onCancel: () => (canceled = true) },
    );
    el.querySelector<HTMLButtonElement>('.js_release_1_cancel')?.click();
    expect(canceled).toBe(true);
  });
});
