import type { Metadata } from "next";
import { ThemePage } from "@/components/theme/theme-page";
import { getCategoryWithCounts, getFeaturedPost, listPublishedPosts } from "@/lib/content/queries";
import { pageParam } from "@/lib/http";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { buildPageMetadata } from "@/lib/seo/page-meta";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = await getLocale();
  return buildPageMetadata({
    title: tr(locale)("meta.posts"),
    path: "/posts",
    page: pageParam((await searchParams).page),
    locale,
  });
}

/** Every post, newest first, with the category chips. The theme's "archive" template lays it out. */
export default async function PostsIndexPage({ searchParams }: Props) {
  const page = pageParam((await searchParams).page);
  const locale = await getLocale();
  const [theme, featured, listing, categories] = await Promise.all([
    getActiveRequestTheme(),
    page === 1 ? getFeaturedPost(new Date(), locale) : Promise.resolve(null),
    listPublishedPosts({ page, locale }),
    getCategoryWithCounts(50, locale),
  ]);
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        view: {
          kind: "archive",
          archiveKind: "index",
          title: tr(locale)("meta.posts"),
          featured,
          posts: listing.items,
          total: listing.total,
          categories,
          pagination: {
            basePath: "/posts",
            current: listing.page,
            totalPages: listing.totalPages,
          },
        },
      }}
    />
  );
}
