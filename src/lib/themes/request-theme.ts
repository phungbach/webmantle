import "server-only";
import { getSiteSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { getSiteBranding, type Appearance } from "@/lib/appearance";
import { getThemeSettings } from "@/lib/themes/settings";
import { getSiteMenu, type MenuItem } from "@/lib/menu";
import { getBlogStyle, type BlogStyle } from "@/lib/blog-style";
import { resolveActiveTheme, loadThemeById, type ThemeBundle } from "@/lib/themes/registry";
import type { SettingValue } from "@/lib/themes/contract";

export type RequestTheme = {
  bundle: ThemeBundle;
  values: Record<string, SettingValue>;
  site: {
    title: string;
    description: string;
    url: string;
    locale: string;
    logoUrl: string | null;
    appearance: Appearance;
    menu: MenuItem[];
    blogStyle: BlogStyle;
  };
};

/** The theme used for public pages: the active one (with fallback), plus its own settings. */
export async function getActiveRequestTheme(): Promise<RequestTheme> {
  const [{ bundle }, site, locale, branding, menu, blogStyle] = await Promise.all([
    resolveActiveTheme(),
    getSiteSettings(),
    getLocale(),
    getSiteBranding(),
    getSiteMenu(),
    getBlogStyle(),
  ]);
  const values = await getThemeSettings(bundle.id, bundle.manifest.settingsSchema);
  return {
    bundle,
    values,
    site: {
      title: site.siteTitle,
      description: site.siteDescription,
      url: SITE_URL,
      locale,
      logoUrl: branding.logoUrl,
      appearance: branding.appearance,
      menu,
      blogStyle,
    },
  };
}

/** Theme used by the admin preview. Looks up the theme by id; never changes the active theme. */
export async function getPreviewRequestTheme(themeId: string): Promise<RequestTheme> {
  const bundle = await loadThemeById(themeId);
  const values = await getThemeSettings(bundle.id, bundle.manifest.settingsSchema);
  const [site, locale, branding, menu, blogStyle] = await Promise.all([
    getSiteSettings(),
    getLocale(),
    getSiteBranding(),
    getSiteMenu(),
    getBlogStyle(),
  ]);
  return {
    bundle,
    values,
    site: {
      title: site.siteTitle,
      description: site.siteDescription,
      url: SITE_URL,
      locale,
      logoUrl: branding.logoUrl,
      appearance: branding.appearance,
      menu,
      blogStyle,
    },
  };
}
