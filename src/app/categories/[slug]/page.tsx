import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import {
  getCategoryBySlug,
  getCategoryWithCounts,
  listPublishedPosts,
} from "@/lib/content/queries";
import { pageParam } from "@/lib/http";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo/page-meta";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const category = await getCategoryBySlug(slug, locale);
  if (!category) return { title: tr(locale)("meta.categoryNotFound") };
  return buildPageMetadata({
    title: category.name,
    description: category.seoDescription || category.description || undefined,
    path: `/categories/${category.slug}`,
    page: pageParam((await searchParams).page),
    locale,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const locale = await getLocale();
  const category = await getCategoryBySlug(slug, locale);
  if (!category) notFound();
  const [theme, listing, categories] = await Promise.all([
    getActiveRequestTheme(),
    listPublishedPosts({ categorySlug: slug, page, locale }),
    getCategoryWithCounts(50, locale),
  ]);
  const crumbs = breadcrumbJsonLd([
    { name: tr(locale)("breadcrumb.home"), url: `${SITE_URL}/` },
    { name: category.name, url: `${SITE_URL}/categories/${category.slug}` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <ThemePage
        bundle={theme.bundle}
        values={theme.values}
        ctx={{
          site: theme.site,
          view: {
            kind: "category",
            archiveKind: "category",
            title: category.name,
            description: category.description,
            posts: listing.items,
            categories,
            total: listing.total,
            pagination: {
              basePath: `/categories/${slug}`,
              current: listing.page,
              totalPages: listing.totalPages,
            },
          },
        }}
      />
    </>
  );
}
