import type { MetadataRoute } from "next";
import {
  publicArchiveSitemapEntries,
  publicPageSitemapEntries,
  publicPostSitemapEntries,
} from "@/lib/content/queries";
import { SITE_URL } from "@/lib/env";
import { getSeoSettings } from "@/lib/seo/site";
import { applyFilter } from "@/lib/plugins/runtime";

export const dynamic = "force-dynamic";

// Only public, published content. Drafts, scheduled posts, search and preview are excluded.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if ((await getSeoSettings()).noindexSite) return [];
  const [posts, pages, archives] = await Promise.all([
    publicPostSitemapEntries(),
    publicPageSitemapEntries(),
    publicArchiveSitemapEntries(),
  ]);
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: archives.latestPostUpdate ?? undefined,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/posts`,
      lastModified: archives.latestPostUpdate ?? undefined,
      changeFrequency: "daily",
      priority: 0.7,
    },
    ...archives.categories.map((c) => ({
      url: `${SITE_URL}/categories/${encodeURIComponent(c.key)}`,
      lastModified: c.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...archives.tags.map((c) => ({
      url: `${SITE_URL}/tags/${encodeURIComponent(c.key)}`,
      lastModified: c.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
    ...archives.authors.map((c) => ({
      url: `${SITE_URL}/authors/${encodeURIComponent(c.key)}`,
      lastModified: c.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
    ...posts.map((p) => ({
      url: `${SITE_URL}/posts/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...pages.map((p) => ({
      url: `${SITE_URL}/pages/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
  return applyFilter("sitemap.entries", entries);
}
