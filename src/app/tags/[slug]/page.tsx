import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { t, tr } from "@/lib/i18n";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { buildPageMetadata } from "@/lib/seo/page-meta";
import { getTagBySlug, listPublishedPosts } from "@/lib/content/queries";
import { pageParam } from "@/lib/http";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = await getLocale();
  const tag = await getTagBySlug((await params).slug, locale);
  if (!tag) return { title: tr(locale)("meta.tagNotFound") };
  return buildPageMetadata({
    title: t(locale, "tag.prefix", { name: tag.name }),
    path: `/tags/${tag.slug}`,
    page: pageParam((await searchParams).page),
    locale,
  });
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const locale = await getLocale();
  const tag = await getTagBySlug(slug, locale);
  if (!tag) notFound();
  const [theme, listing] = await Promise.all([
    getActiveRequestTheme(),
    listPublishedPosts({ tagSlug: slug, page, locale }),
  ]);
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        view: {
          kind: "archive",
          archiveKind: "tag",
          title: t(theme.site.locale, "tag.prefix", { name: tag.name }),
          posts: listing.items,
          total: listing.total,
          pagination: {
            basePath: `/tags/${slug}`,
            current: listing.page,
            totalPages: listing.totalPages,
          },
        },
      }}
    />
  );
}
