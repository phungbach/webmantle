import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/settings";
import { getSeoSettings, siteOgImageUrl } from "@/lib/seo/site";
import { SITE_URL } from "@/lib/env";
import { truncate } from "@/lib/seo/text";

export const META_DESCRIPTION_MAX = 160;

/** "vi" -> "vi_VN" for og:locale. */
export function ogLocale(locale: string): string {
  return locale === "en" ? "en_US" : "vi_VN";
}

/** Canonical path for a list: page 1 has no parameter, later pages carry ?page=N. */
export function pagedPath(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}

export type PageMetaInput = {
  title: string;
  /** Plain text; shortened to 160 characters. */
  description?: string;
  /** Path of the page, for example "/categories/news". */
  path: string;
  page?: number;
  type?: "website" | "profile";
  locale: string;
  /** Use the title exactly as given, without the " · Site" suffix. */
  absoluteTitle?: boolean;
  robots?: Metadata["robots"];
};

/**
 * Metadata for a public listing or static page: canonical, description, Open Graph and Twitter.
 * Next.js replaces a parent's openGraph/twitter objects instead of merging them, so each page
 * repeats the site-wide values here.
 */
export async function buildPageMetadata(input: PageMetaInput): Promise<Metadata> {
  const [site, seo] = await Promise.all([getSiteSettings(), getSeoSettings()]);
  const description = input.description
    ? truncate(input.description.trim(), META_DESCRIPTION_MAX) || undefined
    : undefined;
  const canonical = pagedPath(input.path, input.page ?? 1);
  const image = siteOgImageUrl(seo, SITE_URL);
  // A title that already ends with the site name must not get it twice.
  const alreadyBranded = input.title
    .trim()
    .toLowerCase()
    .endsWith(site.siteTitle.trim().toLowerCase());
  const absolute = input.absoluteTitle || alreadyBranded;
  const ogTitle = absolute ? input.title : `${input.title} ${seo.separator} ${site.siteTitle}`;
  const robots = seo.noindexSite ? { index: false, follow: false } : input.robots;
  return {
    title: absolute ? { absolute: input.title } : input.title,
    description,
    alternates: { canonical },
    ...(robots ? { robots } : {}),
    openGraph: {
      type: input.type ?? "website",
      title: ogTitle,
      description,
      url: canonical,
      siteName: site.siteTitle,
      locale: ogLocale(input.locale),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      ...(seo.twitterHandle ? { site: `@${seo.twitterHandle}` } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };
}
