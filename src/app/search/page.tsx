import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { t, tr } from "@/lib/i18n";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { getCategoryWithCounts, listPublishedPosts } from "@/lib/content/queries";
import { pageParam, queryParam } from "@/lib/http";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Search results are not useful to search engines, so they are excluded from the index.
export async function generateMetadata(): Promise<Metadata> {
  return { title: tr(await getLocale())("meta.search"), robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = queryParam(params.q);
  const page = pageParam(params.page);
  const locale = await getLocale();
  const [theme, listing, categories] = await Promise.all([
    getActiveRequestTheme(),
    query
      ? listPublishedPosts({ search: query, page, locale })
      : Promise.resolve({ items: [], total: 0, page: 1, totalPages: 1 }),
    getCategoryWithCounts(50, locale),
  ]);
  const title = query
    ? t(theme.site.locale, "search.resultsFor", { query })
    : t(theme.site.locale, "search.title");
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        view: {
          kind: "search",
          title,
          query,
          posts: listing.items,
          categories,
          total: listing.total,
          pagination: {
            basePath: "/search",
            current: listing.page,
            totalPages: listing.totalPages,
            query,
          },
        },
      }}
    />
  );
}
