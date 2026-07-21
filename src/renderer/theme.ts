import { resolveTheme, type Theme, type ThemeSetting } from '../core/theme/index';

/** テーマ設定を要素の data-theme 属性に反映し、解決したテーマを返す。 */
export function applyTheme(root: HTMLElement, setting: ThemeSetting, prefersDark: boolean): Theme {
  const theme = resolveTheme(setting, prefersDark);
  root.setAttribute('data-theme', theme);
  return theme;
}
