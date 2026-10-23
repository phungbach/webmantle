import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { getSeoSettings } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { noindexSite } = await getSeoSettings();
  // A site marked "noindex" blocks everything and does not advertise a sitemap.
  if (noindexSite) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/login", "/preview", "/design-preview", "/search", "/api", "/demo"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
