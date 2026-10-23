import { cache } from "react";
import { prisma } from "@/lib/db";

export type SiteSettings = {
  siteTitle: string;
  siteDescription: string;
  defaultLocale: string;
  activeThemeId: string | null;
};

const DEFAULTS: SiteSettings = {
  siteTitle: "Blog của tôi",
  siteDescription: "Viết về phần mềm, thiết kế và web.",
  defaultLocale: "vi",
  activeThemeId: null,
};

/** Memoized per request (React cache), so layout and page share one query. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await prisma.siteSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    siteTitle: map.get("siteTitle") ?? DEFAULTS.siteTitle,
    siteDescription: map.get("siteDescription") ?? DEFAULTS.siteDescription,
    defaultLocale: map.get("defaultLocale") ?? DEFAULTS.defaultLocale,
    activeThemeId: map.get("activeThemeId") ?? null,
  };
});

export async function setSiteSetting(key: string, value: string) {
  await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
