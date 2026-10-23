import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { t, tr } from "@/lib/i18n";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { buildPageMetadata } from "@/lib/seo/page-meta";
import { getAuthorById, listPublishedPosts } from "@/lib/content/queries";
import { pageParam } from "@/lib/http";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const author = await getAuthorById((await params).slug);
  const locale = await getLocale();
  if (!author) return { title: tr(locale)("meta.authorNotFound") };
  return buildPageMetadata({
    title: t(locale, "author.postsBy", { name: author.name }),
    path: `/authors/${author.id}`,
    page: pageParam((await searchParams).page),
    type: "profile",
    locale,
  });
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const author = await getAuthorById(slug);
  if (!author) notFound();
  const [theme, listing] = await Promise.all([
    getActiveRequestTheme(),
    listPublishedPosts({ authorId: slug, page, locale: await getLocale() }),
  ]);
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        view: {
          kind: "archive",
          archiveKind: "author",
          title: t(theme.site.locale, "author.postsBy", { name: author.name }),
          posts: listing.items,
          total: listing.total,
          pagination: {
            basePath: `/authors/${slug}`,
            current: listing.page,
            totalPages: listing.totalPages,
          },
        },
      }}
    />
  );
}
