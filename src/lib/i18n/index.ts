import { en, vi, type MessageKey } from "@/lib/i18n/messages";

export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "cms_locale";

const TABLES: Record<Locale, Record<MessageKey, string>> = { vi, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Translates a message key. Placeholders look like {name}. Unknown locales use Vietnamese.
 * Counts use a ".one" or ".other" suffix: pluralKey("post.count", 2) -> "post.count.other".
 */
export function t(
  locale: string | undefined,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const table = TABLES[isLocale(locale) ? locale : DEFAULT_LOCALE];
  let text: string = table[key] ?? vi[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function pluralKey(base: "post.count", count: number): MessageKey {
  return `${base}.${count === 1 ? "one" : "other"}` as MessageKey;
}

const INTL_LOCALE: Record<Locale, string> = { vi: "vi-VN", en: "en-US" };

export function intlLocale(locale: string | undefined): string {
  return INTL_LOCALE[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** Returns a translator bound to one locale. Pages use tr(locale)("key"). */
export function tr(locale: string | undefined) {
  return (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
}
