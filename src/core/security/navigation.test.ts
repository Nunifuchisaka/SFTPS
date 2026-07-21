import { describe, it, expect } from 'vitest';
import { isAllowedNavigation, type NavigationPolicy } from './navigation';

const packaged: NavigationPolicy = { appUrl: 'file:///C:/app/out/renderer/index.html' };
const dev: NavigationPolicy = { devServerUrl: 'http://localhost:5173/' };

describe('isAllowedNavigation (packaged)', () => {
  it('allows the app entry document itself', () => {
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html', packaged)).toBe(true);
  });

  it('allows a reload carrying a query or hash', () => {
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html?x=1', packaged)).toBe(true);
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html#top', packaged)).toBe(true);
  });

  it('denies any other local file (no reading arbitrary disk content into the renderer)', () => {
    expect(isAllowedNavigation('file:///C:/Windows/win.ini', packaged)).toBe(false);
    expect(isAllowedNavigation('file:///C:/app/out/renderer/../../evil.html', packaged)).toBe(false);
  });

  it('denies remote origins (window.api must never reach a foreign page)', () => {
    expect(isAllowedNavigation('https://evil.example/', packaged)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5173/', packaged)).toBe(false);
  });

  it('denies pseudo protocols', () => {
    expect(isAllowedNavigation('javascript:alert(1)', packaged)).toBe(false);
    expect(isAllowedNavigation('data:text/html,<script>1</script>', packaged)).toBe(false);
    expect(isAllowedNavigation('about:blank', packaged)).toBe(false);
  });

  it('denies malformed URLs', () => {
    expect(isAllowedNavigation('', packaged)).toBe(false);
    expect(isAllowedNavigation('not a url', packaged)).toBe(false);
  });
});

describe('isAllowedNavigation (dev server)', () => {
  it('allows the dev server origin and its paths', () => {
    expect(isAllowedNavigation('http://localhost:5173/', dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5173/index.html', dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5173/@vite/client', dev)).toBe(true);
  });

  it('denies a different port or host even in dev', () => {
    expect(isAllowedNavigation('http://localhost:5174/', dev)).toBe(false);
    expect(isAllowedNavigation('http://evil.example:5173/', dev)).toBe(false);
  });
});

describe('isAllowedNavigation (no policy)', () => {
  it('denies everything when nothing is allowed explicitly', () => {
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html')).toBe(false);
    expect(isAllowedNavigation('https://example.com/')).toBe(false);
  });
});
