// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { HistoryEntry } from '../core/history/index';
import { createHistoryView } from './history-view';

const entries: HistoryEntry[] = [
  { id: 'a', timestamp: '2026-05-02T00:00:00.000Z', kind: 'upload', profileId: 'p1', path: '/pub/a.txt', status: 'success', bytes: 100 },
  { id: 'b', timestamp: '2026-05-01T00:00:00.000Z', kind: 'download', profileId: 'p1', path: '/pub/b.txt', status: 'failed', error: 'boom' },
];

describe('createHistoryView', () => {
  it('renders one row per entry with a status class', () => {
    const el = createHistoryView(entries);
    const items = el.querySelectorAll('.history_1__item');
    expect(items).toHaveLength(2);
    expect(items[0].className).toContain('is_success');
    expect(items[0].textContent).toContain('/pub/a.txt');
    expect(items[1].className).toContain('is_failed');
    expect(items[1].textContent).toContain('boom');
  });

  it('shows an empty notice when there is no history', () => {
    const el = createHistoryView([]);
    expect(el.querySelector('.history_1__empty')).not.toBeNull();
  });
});
