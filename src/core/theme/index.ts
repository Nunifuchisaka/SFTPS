export type Theme = 'light' | 'dark';
export type ThemeSetting = 'light' | 'dark' | 'system';

export const THEME_SETTINGS: ThemeSetting[] = ['light', 'dark', 'system'];

/** テーマ設定と OS の暗色設定から実効テーマを解決する純粋関数。 */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): Theme {
  if (setting === 'light') return 'light';
  if (setting === 'dark') return 'dark';
  return prefersDark ? 'dark' : 'light';
}

/** 永続化された設定値を検証し、不正なら 'system' へフォールバックする。 */
export function normalizeThemeSetting(raw: string | null): ThemeSetting {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}
