import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { getSiteSettings } from "@/lib/settings";
import { getSeoSettings, seoTemplate, siteOgImageUrl } from "@/lib/seo/site";
import { ogLocale } from "@/lib/seo/page-meta";
import { SITE_URL } from "@/lib/env";
import { getSiteBranding } from "@/lib/appearance";
import { TrackView } from "@/components/analytics/track-view";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, site, seo, { logoId }] = await Promise.all([
    getLocale(),
    getSiteSettings(),
    getSeoSettings(),
    getSiteBranding(),
  ]);
  const title = seo.homeTitle || site.siteTitle;
  const description = seo.homeDescription || site.siteDescription;
  const image = siteOgImageUrl(seo, SITE_URL);
  return {
    // Absolute URLs for canonical, Open Graph and sitemap entries are built from this base.
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: seoTemplate(site.siteTitle, seo.separator) },
    description,
    openGraph: {
      siteName: site.siteTitle,
      type: "website",
      locale: ogLocale(locale),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(seo.twitterHandle ? { site: `@${seo.twitterHandle}` } : {}),
      ...(image ? { images: [image] } : {}),
    },
    ...(seo.noindexSite ? { robots: { index: false, follow: false } } : {}),
    // The logo doubles as the browser tab icon. The logo id is part of the address, so browsers
    // that cached the old icon fetch the new one as soon as the logo changes.
    icons: logoId ? { icon: `/site-icon?v=${logoId}` } : undefined,
  };
}

// The root layout is intentionally theme-free. Public pages inject their theme through ThemeFrame,
// and the admin provides its own shell. The language follows the visitor's choice.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        {children}
        <TrackView />
      </body>
    </html>
  );
}
