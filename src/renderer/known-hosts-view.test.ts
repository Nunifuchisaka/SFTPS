// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { KnownHostEntry } from '../core/hostkey/index';
import { createKnownHostsView } from './known-hosts-view';

const entries: KnownHostEntry[] = [
  { host: 'a.example', port: 22, fingerprint: 'SHA256:AAA' },
  { host: 'b.example', port: 2222, fingerprint: 'SHA256:BBB' },
];

function noop(): void {}

const labels = { remove: '信頼を取り消す', empty: '登録なし' };

describe('createKnownHostsView', () => {
  it('renders one row per trusted host with host:port and fingerprint', () => {
    const el = createKnownHostsView(entries, { onRemove: noop, labels });
    const items = el.querySelectorAll('.knownhosts_1__item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('a.example:22');
    expect(items[0].textContent).toContain('SHA256:AAA');
    expect(items[1].textContent).toContain('b.example:2222');
  });

  it('calls onRemove with the entry whose revoke button was clicked', () => {
    const removed: KnownHostEntry[] = [];
    const el = createKnownHostsView(entries, { onRemove: (e) => removed.push(e), labels });
    el.querySelectorAll<HTMLElement>('.js_knownhost_remove')[1].click();
    expect(removed).toEqual([entries[1]]);
  });

  it('shows an empty notice when nothing is trusted yet', () => {
    const el = createKnownHostsView([], { onRemove: noop, labels });
    expect(el.querySelector('.knownhosts_1__empty')?.textContent).toBe('登録なし');
    expect(el.querySelectorAll('.knownhosts_1__item')).toHaveLength(0);
  });

  it('uses the injected labels (i18n stays outside the view)', () => {
    const el = createKnownHostsView(entries, {
      onRemove: noop,
      labels: { remove: 'Revoke trust', empty: 'No entries' },
    });
    expect(el.querySelector('.js_knownhost_remove')?.textContent).toBe('Revoke trust');
  });
});
