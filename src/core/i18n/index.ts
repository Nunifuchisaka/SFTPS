import type { Dictionaries, Locale } from './dictionaries';

export {
  dictionaries,
  LOCALES,
  type Locale,
  type Dictionary,
  type Dictionaries,
} from './dictionaries';

export type TranslateParams = Record<string, string | number>;

const FALLBACK_LOCALE = 'en';

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * 文言を引く純粋関数。locale → en → キー名 の順にフォールバックし、{param} を補間する。
 */
export function translate(
  dicts: Dictionaries,
  locale: string,
  key: string,
  params?: TranslateParams,
): string {
  const template = dicts[locale]?.[key] ?? dicts[FALLBACK_LOCALE]?.[key] ?? key;
  return interpolate(template, params);
}

/** 辞書とロケールを束ねた翻訳ヘルパを返す。 */
export function createTranslator(
  dicts: Dictionaries,
  locale: string,
): (key: string, params?: TranslateParams) => string {
  return (key, params) => translate(dicts, locale, key, params);
}

/** 'ja-JP' / 'en_US' 等を基底言語（小文字）へ正規化する。 */
export function normalizeLocale(raw: string): string {
  return raw.toLowerCase().split(/[-_]/)[0];
}

/** 要求ロケールを正規化し、対応していればそれを、なければ fallback を返す。 */
export function resolveLocale(
  requested: string,
  available: readonly Locale[],
  fallback: Locale,
): Locale {
  const norm = normalizeLocale(requested);
  return (available as readonly string[]).includes(norm) ? (norm as Locale) : fallback;
}
