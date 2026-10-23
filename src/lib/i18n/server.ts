import "server-only";
import { cookies } from "next/headers";
import { getSiteSettings } from "@/lib/settings";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

/**
 * The language for this visitor: their own choice (cookie) if set, otherwise the site default
 * from settings, otherwise Vietnamese.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const chosen = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  const site = await getSiteSettings();
  return isLocale(site.defaultLocale) ? site.defaultLocale : DEFAULT_LOCALE;
}
