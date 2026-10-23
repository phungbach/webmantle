import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ThemePage } from "@/components/theme/theme-page";
import { getPreviewRequestTheme } from "@/lib/themes/request-theme";
import { verifyPreviewToken } from "@/lib/themes/preview-token";
import { getFeaturedPost, listPublishedPosts } from "@/lib/content/queries";

// Previews are never indexed and never cached.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ themeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Renders an installed theme without activating it. Access requires a signed token that an admin
 * obtains from the Theme Manager. The token grants nothing beyond viewing this rendering.
 */
export default async function ThemePreviewPage({ params, searchParams }: Props) {
  const { themeId } = await params;
  const token = (await searchParams).t;
  const payload = verifyPreviewToken(Array.isArray(token) ? token[0] : token);
  if (!payload || payload.themeId !== themeId) notFound();

  // Preview shows the first page only, so pagination links (which would need the token) are omitted.
  const theme = await getPreviewRequestTheme(themeId).catch(() => null);
  if (!theme) notFound();
  const [featured, listing] = await Promise.all([
    getFeaturedPost(new Date(), theme.site.locale),
    listPublishedPosts({ page: 1, locale: theme.site.locale }),
  ]);
  // device=mobile narrows the page to a phone width, so the layout can be checked at that size.
  const device = (await searchParams).device;
  const mobile = device === "mobile";
  const frame = (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        preview: true,
        view: {
          kind: "home",
          featured,
          posts: listing.items,
          total: listing.total,
        },
      }}
    />
  );
  if (!mobile) return frame;
  // The phone frame is an iframe, so the page inside it has a real 390px viewport and the theme's own
  // media queries (and mobile menu) apply, exactly as on a phone.
  const innerToken = Array.isArray(token) ? token[0] : token;
  return (
    <div className="flex min-h-screen justify-center bg-slate-200 p-4">
      <div className="w-[390px] max-w-full overflow-hidden rounded-[2rem] border-8 border-slate-800 bg-white shadow-xl">
        <iframe
          src={`/preview/${encodeURIComponent(themeId)}?t=${encodeURIComponent(innerToken ?? "")}`}
          title="Mobile preview"
          className="block h-[min(844px,calc(100vh-4.5rem))] w-full border-0"
        />
      </div>
    </div>
  );
}
