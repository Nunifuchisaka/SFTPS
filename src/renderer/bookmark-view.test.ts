// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Bookmark } from '../core/bookmark/index';
import { createBookmarkView } from './bookmark-view';

const bookmarks: Bookmark[] = [
  { id: 'a', profileId: 'p1', name: '公開', remotePath: '/var/www/pub' },
  { id: 'b', profileId: 'p1', name: '画像', remotePath: '/assets/img' },
];

function noop(): void {}

describe('createBookmarkView', () => {
  it('renders one row per bookmark showing name and path', () => {
    const el = createBookmarkView(bookmarks, { onOpen: noop, onRemove: noop });
    const items = el.querySelectorAll('.bookmark_1__item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('公開');
    expect(items[0].textContent).toContain('/var/www/pub');
    expect(items[1].textContent).toContain('画像');
  });

  it('calls onOpen with the clicked bookmark', () => {
    const opened: Bookmark[] = [];
    const el = createBookmarkView(bookmarks, { onOpen: (b) => opened.push(b), onRemove: noop });
    const label = el.querySelectorAll<HTMLElement>('.js_bookmark_open')[1];
    label.click();
    expect(opened).toEqual([bookmarks[1]]);
  });

  it('calls onRemove with the bookmark whose delete button was clicked', () => {
    const removed: Bookmark[] = [];
    const el = createBookmarkView(bookmarks, { onOpen: noop, onRemove: (b) => removed.push(b) });
    const btn = el.querySelectorAll<HTMLElement>('.js_bookmark_remove')[0];
    btn.click();
    expect(removed).toEqual([bookmarks[0]]);
  });

  it('shows an empty notice when there is no bookmark', () => {
    const el = createBookmarkView([], { onOpen: noop, onRemove: noop });
    expect(el.querySelector('.bookmark_1__empty')).not.toBeNull();
    expect(el.querySelectorAll('.bookmark_1__item')).toHaveLength(0);
  });
});
