import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import {
  getCategoryWithCounts,
  getFeaturedPost,
  getHomePage,
  listPublishedPosts,
} from "@/lib/content/queries";
import { composeLayout } from "@/lib/builder/compose";
import { getPublishedLayout } from "@/lib/builder/store";
import { pageParam } from "@/lib/http";
import { getSiteSettings } from "@/lib/settings";
import { getSiteBranding } from "@/lib/appearance";
import { getSeoSettings } from "@/lib/seo/site";
import { buildPageMetadata } from "@/lib/seo/page-meta";
import { siteJsonLd } from "@/lib/seo/jsonld";
import { absoluteUrl } from "@/lib/seo/resolve";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const locale = await getLocale();
  const [site, seo, params, homePage] = await Promise.all([
    getSiteSettings(),
    getSeoSettings(),
    searchParams,
    getHomePage(locale),
  ]);
  // The SEO text of the theme's home page (Pages) wins when it is filled in.
  return buildPageMetadata({
    title: homePage?.seoTitle || seo.homeTitle || site.siteTitle,
    description: homePage?.seoDescription || seo.homeDescription || site.siteDescription,
    path: "/",
    page: pageParam(params.page),
    locale,
    absoluteTitle: true,
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const locale = await getLocale();
  const [theme, featured, listing, categories, site, branding] = await Promise.all([
    getActiveRequestTheme(),
    getFeaturedPost(new Date(), locale),
    listPublishedPosts({ page, locale }),
    getCategoryWithCounts(50, locale),
    getSiteSettings(),
    getSiteBranding(),
  ]);
  const doc = await getPublishedLayout({ kind: "home" });
  const layoutOverride = doc ? composeLayout(theme.bundle, "home", doc) : undefined;
  const jsonLd = siteJsonLd({
    name: site.siteTitle,
    url: SITE_URL,
    locale,
    logoUrl: branding.logoUrl ? absoluteUrl(branding.logoUrl, SITE_URL) : null,
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <ThemePage
        bundle={theme.bundle}
        values={theme.values}
        ctx={{
          site: theme.site,
          view: {
            kind: "home",
            featured,
            posts: listing.items,
            total: listing.total,
            categories,
            pagination: { basePath: "/", current: listing.page, totalPages: listing.totalPages },
            layoutOverride,
          },
        }}
      />
    </>
  );
}
