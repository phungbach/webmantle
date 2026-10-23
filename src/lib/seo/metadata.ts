import type { Metadata } from "next";
import type { ResolvedSeo } from "@/lib/seo/resolve";

/**
 * Next.js Metadata for a post. Canonical, robots, Open Graph and Twitter values all come from the
 * resolved SEO data, so the HTML sent to crawlers already contains them (no client JavaScript).
 */
export type PostMetadataExtras = {
  siteTitle?: string;
  locale?: string;
  authors?: string[];
  /** Share image used when the post has none. */
  fallbackImage?: string | null;
  /** Twitter handle without the @. */
  twitterSite?: string;
  noindexSite?: boolean;
};

export function postMetadata(
  seo: ResolvedSeo,
  publishedAt: string,
  modifiedAt: string,
  extras: PostMetadataExtras = {}
): Metadata {
  const imageUrl = seo.ogImage ?? extras.fallbackImage ?? null;
  const images = imageUrl ? [{ url: imageUrl, alt: seo.ogImageAlt }] : undefined;
  // A title that already ends with the site name must not get it twice.
  const branded =
    !!extras.siteTitle &&
    seo.title.trim().toLowerCase().endsWith(extras.siteTitle.trim().toLowerCase());
  return {
    title: branded ? { absolute: seo.title } : seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    robots: extras.noindexSite
      ? { index: false, follow: false }
      : { index: seo.robots.index, follow: seo.robots.follow },
    ...(extras.authors?.length ? { authors: extras.authors.map((name) => ({ name })) } : {}),
    openGraph: {
      type: "article",
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: seo.canonical,
      publishedTime: publishedAt,
      modifiedTime: modifiedAt,
      ...(extras.siteTitle ? { siteName: extras.siteTitle } : {}),
      ...(extras.locale ? { locale: extras.locale } : {}),
      ...(extras.authors?.length ? { authors: extras.authors } : {}),
      images,
    },
    twitter: {
      card: seo.twitterCard,
      title: seo.ogTitle,
      description: seo.ogDescription,
      ...(extras.twitterSite ? { site: `@${extras.twitterSite}` } : {}),
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}
