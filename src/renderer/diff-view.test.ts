// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { UploadPreview } from '../core/upload/index';
import { createDiffView, diffOrientationLabels } from './diff-view';

const textPreview: UploadPreview = {
  localPath: '/local/page.html',
  remotePath: '/site/page.html',
  isNew: false,
  binary: false,
  beforeSize: 3,
  afterSize: 3,
  segments: [
    { type: 'equal', value: 'a' },
    { type: 'removed', value: 'b' },
    { type: 'added', value: 'x' },
    { type: 'equal', value: 'c' },
  ],
  summary: { added: 1, removed: 1 },
};

describe('createDiffView', () => {
  it('renders one span per segment with is_* state classes', () => {
    const el = createDiffView(textPreview);
    const spans = el.querySelectorAll('.diff_1__seg');
    expect(spans).toHaveLength(4);
    expect(spans[0].className).toContain('is_equal');
    expect(spans[1].className).toContain('is_removed');
    expect(spans[1].textContent).toBe('b');
    expect(spans[2].className).toContain('is_added');
    expect(spans[2].textContent).toBe('x');
  });

  it('renders the full before+after text inside the diff body', () => {
    const el = createDiffView(textPreview);
    const body = el.querySelector('.diff_1__body');
    expect(body?.textContent).toBe('abxc');
  });

  it('renders the +added -removed summary', () => {
    const el = createDiffView(textPreview);
    expect(el.querySelector('.diff_1__summary')?.textContent).toBe('+1 -1');
  });

  it('shows a size comparison for binary content', () => {
    const el = createDiffView({
      localPath: '/l',
      remotePath: '/r',
      isNew: false,
      binary: true,
      beforeSize: 12,
      afterSize: 14,
    });
    const binary = el.querySelector('.diff_1__binary');
    expect(binary).not.toBeNull();
    expect(binary?.textContent).toContain('12');
    expect(binary?.textContent).toContain('14');
  });

  it('shows a new-file notice with the size', () => {
    const el = createDiffView({
      localPath: '/l',
      remotePath: '/r',
      isNew: true,
      binary: false,
      afterSize: 99,
    });
    const notice = el.querySelector('.diff_1__new');
    expect(notice?.textContent).toContain('99');
  });
});

describe('diffOrientationLabels', () => {
  it('labels download as local(before, removed/red) vs remote(after, added/green)', () => {
    expect(diffOrientationLabels('download')).toEqual({
      beforeLabel: 'ローカル(既存)',
      afterLabel: 'リモート(新)',
    });
  });

  it('labels upload as remote(before) vs local(after)', () => {
    expect(diffOrientationLabels('upload')).toEqual({
      beforeLabel: 'リモート(既存)',
      afterLabel: 'ローカル(新)',
    });
  });
});

describe('createDiffView size-limited preview', () => {
  const tooLargePreview: UploadPreview = {
    localPath: '/local/dump.sql',
    remotePath: '/site/dump.sql',
    isNew: false,
    binary: false,
    tooLarge: true,
    diffLimitBytes: 1024 * 1024,
    beforeSize: 3_000_000,
    afterSize: 4_000_000,
  };

  it('states that the diff was skipped and shows the size comparison instead', () => {
    const el = createDiffView(tooLargePreview);
    const notice = el.querySelector('.diff_1__toolarge');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('大きすぎるため差分表示を省略');
    expect(notice?.textContent).toContain('3000000');
    expect(notice?.textContent).toContain('4000000');
    expect(el.querySelectorAll('.diff_1__seg')).toHaveLength(0);
  });
});
