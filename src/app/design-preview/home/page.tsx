import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { getCategoryWithCounts, getFeaturedPost, listPublishedPosts } from "@/lib/content/queries";
import { requireDesigner, previewLayout } from "@/app/design-preview/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default async function HomePreview() {
  const { canEditContent } = await requireDesigner({ kind: "home" });
  const locale = await getLocale();
  const [theme, featured, listing, categories] = await Promise.all([
    getActiveRequestTheme(),
    getFeaturedPost(new Date(), locale),
    listPublishedPosts({ page: 1, locale }),
    getCategoryWithCounts(50, locale),
  ]);
  const layoutOverride = await previewLayout(theme.bundle, { kind: "home" });
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        edit: true,
        contentEdit: canEditContent,
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
  );
}
