import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { getAdjacentPosts, getPublishedPostDetail, getRelatedPosts } from "@/lib/content/queries";
import { postMetadata } from "@/lib/seo/metadata";
import { ogLocale } from "@/lib/seo/page-meta";
import { getSeoSettings, siteOgImageUrl } from "@/lib/seo/site";
import { resolveSeo, type SeoSource } from "@/lib/seo/resolve";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/env";
import { applyFilter } from "@/lib/plugins/runtime";
import { sanitizeRichText } from "@/lib/security/sanitize";
import { getSiteSettings } from "@/lib/settings";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

function seoSourceOf(
  post: NonNullable<Awaited<ReturnType<typeof getPublishedPostDetail>>>
): SeoSource {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.bodyHtml,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrl: post.canonicalSetting,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    robotsIndex: post.robotsIndex,
    robotsFollow: post.robotsFollow,
    twitterCard: post.twitterCard,
    focusKeyword: post.focusKeyword,
    featuredImageUrl: post.featuredImageUrl,
    socialImageUrl: post.socialImageUrl,
    featuredImageAlt: post.featuredImageAlt,
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const post = await getPublishedPostDetail(slug, new Date(), locale);
  if (!post) return { title: tr(locale)("meta.postNotFound"), robots: { index: false } };
  const [site, seoSettings] = await Promise.all([getSiteSettings(), getSeoSettings()]);
  return postMetadata(resolveSeo(seoSourceOf(post), SITE_URL), post.publishedAt, post.updatedAt, {
    siteTitle: site.siteTitle,
    locale: ogLocale(locale),
    authors: [post.author.name],
    fallbackImage: siteOgImageUrl(seoSettings, SITE_URL),
    twitterSite: seoSettings.twitterHandle,
    noindexSite: seoSettings.noindexSite,
  });
}

export default async function PostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const locale = await getLocale();
  const [theme, post, settings] = await Promise.all([
    getActiveRequestTheme(),
    getPublishedPostDetail(slug, new Date(), locale),
    getSiteSettings(),
  ]);
  if (!post) notFound();
  const filtered = await applyFilter("post.detail", post);
  // Plugin output is untrusted HTML until it has been sanitized again.
  const shown = { ...filtered, bodyHtml: sanitizeRichText(filtered.bodyHtml) };
  const related = await getRelatedPosts(shown, 4, new Date(), locale);
  const adjacent = await getAdjacentPosts(shown, new Date(), locale);
  const seo = resolveSeo(seoSourceOf(shown), SITE_URL);
  const jsonLd = blogPostingJsonLd({
    seo,
    headline: seo.title,
    authorName: shown.author.name,
    siteTitle: theme.site.title,
    datePublished: shown.publishedAt,
    dateModified: shown.updatedAt,
    tags: shown.tags.map((tag) => tag.name),
    locale: settings.defaultLocale,
  });
  const firstCategory = shown.categories[0];
  const crumbs = [
    { name: tr(locale)("breadcrumb.home"), url: `${SITE_URL}/` },
    ...(firstCategory
      ? [{ name: firstCategory.name, url: `${SITE_URL}/categories/${firstCategory.slug}` }]
      : []),
    { name: shown.title, url: seo.canonical },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(crumbs) }}
      />
      <ThemePage
        bundle={theme.bundle}
        values={theme.values}
        ctx={{
          site: theme.site,
          view: {
            kind: "single-post",
            templateId: shown.template,
            title: shown.title,
            post: shown,
            related,
            adjacent,
          },
        }}
      />
    </>
  );
}
