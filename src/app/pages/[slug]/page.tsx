import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { buildPageMetadata } from "@/lib/seo/page-meta";
import { htmlToText } from "@/lib/seo/text";
import { composeLayout } from "@/lib/builder/compose";
import { getPublishedLayout } from "@/lib/builder/store";
import { getPublishedPage } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getLocale();
  const page = await getPublishedPage((await params).slug, locale);
  if (!page) return { title: tr(locale)("meta.pageNotFound") };
  if (page.isHome) return { title: page.title, robots: { index: false, follow: true } };
  return buildPageMetadata({
    title: page.seoTitle || page.title,
    description: page.seoDescription || htmlToText(page.bodyHtml),
    path: `/pages/${page.slug}`,
    locale,
  });
}

export default async function StaticPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const [theme, page] = await Promise.all([
    getActiveRequestTheme(),
    getPublishedPage(slug, locale),
  ]);
  if (!page) notFound();
  if (page.isHome) redirect("/"); // the home page lives at "/" only
  const doc = await getPublishedLayout({ kind: "page", id: page.id });
  const layoutOverride = doc ? composeLayout(theme.bundle, "page", doc) : undefined;
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        view: { kind: "page", templateId: page.template, title: page.title, page, layoutOverride },
      }}
    />
  );
}
