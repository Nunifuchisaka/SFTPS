/** 画面遷移を許可する宛先の定義。指定が無いものは一切許可しない（既定拒否）。 */
export interface NavigationPolicy {
  /** 許可するローカル文書の URL（通常 out/renderer/index.html の file: URL）。 */
  appUrl?: string | null;
  /** 開発サーバーの URL（ELECTRON_RENDERER_URL）。同一 origin 配下のみ許可する。 */
  devServerUrl?: string | null;
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** クエリ・ハッシュを落とした比較用の文字列（リロードで付く ?t=... を許容するため）。 */
function documentKey(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/**
 * レンダラの遷移先が許可された宛先か判定する純粋関数。
 * レンダラには contextBridge で window.api が生えているため、
 * 外部 origin へ遷移させてはならない（既定拒否・ホワイトリストのみ許可）。
 */
export function isAllowedNavigation(url: string, policy: NavigationPolicy = {}): boolean {
  const target = parse(url);
  if (!target) return false;

  if (policy.devServerUrl) {
    const dev = parse(policy.devServerUrl);
    if (dev && target.origin === dev.origin && dev.origin !== 'null') return true;
  }

  if (policy.appUrl && target.protocol === 'file:') {
    const app = parse(policy.appUrl);
    if (app && documentKey(target) === documentKey(app)) return true;
  }

  return false;
}
