import type { ResolvedSeo } from "@/lib/seo/resolve";

export type JsonLdInput = {
  seo: ResolvedSeo;
  headline: string;
  authorName: string;
  siteTitle: string;
  datePublished: string;
  dateModified: string;
  tags: string[];
  locale: string;
};

/**
 * Serialises JSON-LD for a <script> element. Characters that could end the element or start
 * markup are written as escapes, so no stored text can break out of the script tag.
 */
export function safeJsonLd(data: unknown): string {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LS)
    .join("\\u2028")
    .split(PS)
    .join("\\u2029");
}

/** Schema.org BreadcrumbList; `url` values must be absolute. */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): string {
  return safeJsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  });
}

/** WebSite (with sitelinks search box) and Organization for the home page. */
export function siteJsonLd(input: {
  name: string;
  url: string;
  locale: string;
  logoUrl: string | null;
}): string {
  const base = input.url.replace(/\/$/, "");
  return safeJsonLd([
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: input.name,
      url: `${base}/`,
      inLanguage: input.locale,
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: input.name,
      url: `${base}/`,
      ...(input.logoUrl ? { logo: input.logoUrl } : {}),
    },
  ]);
}

/**
 * Schema.org BlogPosting as a JSON-LD string. Every value comes from the database and is encoded
 * as JSON. Characters that could end the <script> element or start markup are written as escapes,
 * so no stored text can break out of the script tag.
 */
export function blogPostingJsonLd(input: JsonLdInput): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline.slice(0, 110),
    description: input.seo.description,
    inLanguage: input.locale,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: { "@type": "Person", name: input.authorName },
    publisher: { "@type": "Organization", name: input.siteTitle },
    mainEntityOfPage: { "@type": "WebPage", "@id": input.seo.canonical },
    url: input.seo.canonical,
  };
  if (input.seo.ogImage) data.image = [input.seo.ogImage];
  const keywords = [input.seo.focusKeyword, ...input.tags].filter(Boolean);
  if (keywords.length > 0) data.keywords = keywords.join(", ");
  return safeJsonLd(data);
}
