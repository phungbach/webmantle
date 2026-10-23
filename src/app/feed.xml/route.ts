import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/settings";
import { publicPostsForFeeds } from "@/lib/content/queries";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c
  );
}

export async function GET() {
  const [site, posts] = await Promise.all([getSiteSettings(), publicPostsForFeeds(30)]);
  const lastBuild = posts[0] ? new Date(posts[0].publishedAt) : new Date();
  const items = posts
    .map(
      (p) => `
    <item>
      <title>${xml(p.title)}</title>
      <link>${xml(`${SITE_URL}${p.url}`)}</link>
      <guid isPermaLink="true">${xml(`${SITE_URL}${p.url}`)}</guid>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
      <dc:creator>${xml(p.author.name)}</dc:creator>
      <description>${xml(p.excerpt)}</description>
    </item>`
    )
    .join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(site.siteTitle)}</title>
    <link>${xml(SITE_URL)}</link>
    <description>${xml(site.siteDescription)}</description>
    <language>${xml(site.defaultLocale)}</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <atom:link href="${xml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
  return new NextResponse(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
