import { htmlToText, truncate } from "@/lib/seo/text";

/** The SEO-relevant fields of a post, as stored (empty strings mean "not entered"). */
export type SeoSource = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  twitterCard: string;
  focusKeyword: string;
  featuredImageUrl: string | null;
  socialImageUrl: string | null;
  featuredImageAlt: string;
};

export type ResolvedSeo = {
  title: string;
  description: string;
  canonical: string;
  robots: { index: boolean; follow: boolean };
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogImageAlt: string;
  twitterCard: "summary" | "summary_large_image";
  focusKeyword: string;
};

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

/** Absolute address for a path, using the configured site URL. Absolute URLs are returned unchanged. */
export function absoluteUrl(pathOrUrl: string, siteUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl.replace(/\/$/, "")}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/**
 * Fills every empty SEO field from the post itself, so a post always has a title, description,
 * canonical address and share image. Entered values always win over the defaults.
 */
export function resolveSeo(source: SeoSource, siteUrl: string): ResolvedSeo {
  const title = source.seoTitle.trim() || source.title;
  const description =
    source.seoDescription.trim() ||
    truncate(htmlToText(source.excerpt || source.body), DESCRIPTION_MAX);
  const descriptionText = truncate(description, DESCRIPTION_MAX);
  const ogImageSource = source.socialImageUrl ?? source.featuredImageUrl;
  const twitterCard = source.twitterCard === "summary" ? "summary" : "summary_large_image";
  return {
    title,
    description: descriptionText,
    canonical: source.canonicalUrl.trim()
      ? absoluteUrl(source.canonicalUrl.trim(), siteUrl)
      : absoluteUrl(`/posts/${source.slug}`, siteUrl),
    robots: { index: source.robotsIndex, follow: source.robotsFollow },
    ogTitle: source.ogTitle.trim() || title,
    ogDescription: source.ogDescription.trim() || descriptionText,
    ogImage: ogImageSource ? absoluteUrl(ogImageSource, siteUrl) : null,
    ogImageAlt: source.featuredImageAlt.trim() || source.title,
    twitterCard,
    focusKeyword: source.focusKeyword.trim(),
  };
}
