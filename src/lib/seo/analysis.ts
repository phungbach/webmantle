import { parseContent } from "@/lib/seo/content";
import { normalizeText } from "@/lib/seo/text";
import { resolveSeo, TITLE_MAX, DESCRIPTION_MAX, type SeoSource } from "@/lib/seo/resolve";

/**
 * Basic on-page checks. They read the content as the editor holds it and do not call any service.
 * They help an editor write clearly; they do NOT predict or guarantee a search ranking.
 * Keyword density is shown for reference only and never changes the verdict.
 */

export type CheckStatus = "good" | "warn" | "bad" | "info";

export type Check = {
  id: CheckId;
  status: CheckStatus;
  params: Record<string, string | number>;
};

export type CheckId =
  | "titleLength"
  | "titleKeyword"
  | "descriptionLength"
  | "descriptionKeyword"
  | "keywordSet"
  | "keywordIntro"
  | "keywordHeading"
  | "keywordSlug"
  | "keywordDensity"
  | "contentLength"
  | "h1Heading"
  | "headingOrder"
  | "headingCount"
  | "imagesAlt"
  | "featuredImage"
  | "featuredImageAlt"
  | "linksInternal"
  | "linksExternal"
  | "slugLength"
  | "canonicalValid"
  | "canonicalOther"
  | "robotsNoindex";

export type AnalysisInput = SeoSource & {
  siteUrl: string;
  siteHost: string;
};

export type Analysis = {
  checks: Check[];
  counts: Record<CheckStatus, number>;
  words: number;
  keywordDensity: number | null;
};

const INTRO_WORDS = 100;

function containsKeyword(haystack: string, keyword: string): boolean {
  return keyword.length > 0 && normalizeText(haystack).includes(keyword);
}

export function analyzeSeo(input: AnalysisInput): Analysis {
  const checks: Check[] = [];
  const add = (id: CheckId, status: CheckStatus, params: Record<string, string | number> = {}) =>
    checks.push({ id, status, params });

  const seo = resolveSeo(input, input.siteUrl);
  const content = parseContent(input.body);
  const keyword = normalizeText(input.focusKeyword);

  // Title
  const titleLength = seo.title.length;
  add(
    "titleLength",
    titleLength === 0 ? "bad" : titleLength >= 30 && titleLength <= TITLE_MAX ? "good" : "warn",
    { length: titleLength, max: TITLE_MAX }
  );
  if (keyword) {
    add("titleKeyword", containsKeyword(seo.title, keyword) ? "good" : "warn");
  }

  // Meta description
  const descriptionLength = seo.description.length;
  add(
    "descriptionLength",
    descriptionLength === 0
      ? "bad"
      : descriptionLength >= 70 && descriptionLength <= DESCRIPTION_MAX
        ? "good"
        : "warn",
    { length: descriptionLength, max: DESCRIPTION_MAX }
  );
  if (keyword) {
    add("descriptionKeyword", containsKeyword(seo.description, keyword) ? "good" : "warn");
  }

  // Focus keyword in the content
  if (!keyword) {
    add("keywordSet", "info");
  } else {
    const intro = normalizeText(content.text.split(/\s+/).slice(0, INTRO_WORDS).join(" "));
    add("keywordIntro", intro.includes(keyword) ? "good" : "warn", { words: INTRO_WORDS });
    const headingText = content.headings
      .filter((h) => h.level === 2 || h.level === 3)
      .map((h) => h.text)
      .join(" ");
    add("keywordHeading", containsKeyword(headingText, keyword) ? "good" : "warn");
    add("keywordSlug", containsKeyword(input.slug.replace(/-/g, " "), keyword) ? "good" : "warn");
    const occurrences = content.words ? normalizeText(content.text).split(keyword).length - 1 : 0;
    const density = content.words ? (occurrences * keyword.split(" ").length) / content.words : 0;
    add("keywordDensity", "info", { percent: Math.round(density * 1000) / 10 });
  }

  // Length of the content
  add("contentLength", content.words < 50 ? "bad" : content.words < 300 ? "warn" : "good", {
    words: content.words,
  });

  // Headings
  const h1Count = content.headings.filter((h) => h.level === 1).length;
  add("h1Heading", h1Count > 0 ? "bad" : "good", { count: h1Count });
  const firstH2 = content.headings.findIndex((h) => h.level === 2);
  const h3BeforeH2 =
    firstH2 === -1
      ? content.headings.some((h) => h.level === 3)
      : content.headings.slice(0, firstH2).some((h) => h.level === 3);
  add("headingOrder", h3BeforeH2 ? "warn" : "good");
  add(
    "headingCount",
    content.words >= 300 && !content.headings.some((h) => h.level === 2) ? "warn" : "good"
  );

  // Images
  const missingAlt = content.images.filter((img) => !img.alt?.trim()).length;
  if (content.images.length > 0) {
    add("imagesAlt", missingAlt === 0 ? "good" : "warn", {
      missing: missingAlt,
      total: content.images.length,
    });
  }
  if (!input.featuredImageUrl) {
    add("featuredImage", "warn");
  } else {
    add("featuredImageAlt", input.featuredImageAlt.trim() ? "good" : "warn");
  }

  // Links
  const isInternal = (href: string) =>
    (href.startsWith("/") && !href.startsWith("//")) ||
    href.toLowerCase().includes(`//${input.siteHost.toLowerCase()}`);
  const internal = content.links.filter(isInternal).length;
  const external = content.links.filter(
    (href) => /^https?:\/\//i.test(href) && !isInternal(href)
  ).length;
  add("linksInternal", internal > 0 ? "good" : "info", { count: internal });
  add("linksExternal", "info", { count: external });

  // Slug and canonical
  add("slugLength", input.slug.length <= 75 ? "good" : "warn", { length: input.slug.length });
  if (input.canonicalUrl.trim()) {
    const canonicalIsUrl = /^https?:\/\/\S+$/i.test(input.canonicalUrl.trim());
    add("canonicalValid", canonicalIsUrl ? "good" : "bad");
    if (canonicalIsUrl && seo.canonical !== `${input.siteUrl}/posts/${input.slug}`) {
      add("canonicalOther", "warn", { url: seo.canonical });
    }
  }

  // Indexing
  if (!seo.robots.index) add("robotsNoindex", "warn");

  const counts: Record<CheckStatus, number> = { good: 0, warn: 0, bad: 0, info: 0 };
  for (const c of checks) counts[c.status] += 1;
  const density =
    keyword && content.words
      ? ((normalizeText(content.text).split(keyword).length - 1) * keyword.split(" ").length) /
        content.words
      : null;
  return { checks, counts, words: content.words, keywordDensity: density };
}
