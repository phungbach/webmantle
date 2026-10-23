import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromZod } from "@/lib/errors";
import { setSiteSetting } from "@/lib/settings";

export const SEPARATORS = ["·", "|", "-", "–", "—"] as const;
export type Separator = (typeof SEPARATORS)[number];

export type SeoSettings = {
  separator: Separator;
  /** "" = use the site title. */
  homeTitle: string;
  /** "" = use the site description. */
  homeDescription: string;
  defaultOgImageId: string | null;
  /** Without the leading @; "" = none. */
  twitterHandle: string;
  noindexSite: boolean;
};

export const SEO_DEFAULTS: SeoSettings = {
  separator: "·",
  homeTitle: "",
  homeDescription: "",
  defaultOgImageId: null,
  twitterHandle: "",
  noindexSite: false,
};

const KEYS = {
  separator: "seo.separator",
  homeTitle: "seo.homeTitle",
  homeDescription: "seo.homeDescription",
  defaultOgImageId: "seo.defaultOgImageId",
  twitterHandle: "seo.twitterHandle",
  noindexSite: "seo.noindexSite",
} as const;

const HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;

/** Stored values are validated again on read, so a bad value falls back to its default. */
function fromRows(map: Map<string, string>): SeoSettings {
  const separator = map.get(KEYS.separator);
  const handle = (map.get(KEYS.twitterHandle) ?? "").trim();
  const homeTitle = (map.get(KEYS.homeTitle) ?? "").trim();
  const homeDescription = (map.get(KEYS.homeDescription) ?? "").trim();
  return {
    separator: (SEPARATORS as readonly string[]).includes(separator ?? "")
      ? (separator as Separator)
      : SEO_DEFAULTS.separator,
    homeTitle: homeTitle.length <= 70 ? homeTitle : "",
    homeDescription: homeDescription.length <= 200 ? homeDescription : "",
    defaultOgImageId: map.get(KEYS.defaultOgImageId) || null,
    twitterHandle: HANDLE.test(handle) ? handle.replace(/^@/, "") : "",
    noindexSite: map.get(KEYS.noindexSite) === "1",
  };
}

/** SEO settings, memoized per request. */
export const getSeoSettings = cache(async (): Promise<SeoSettings> => {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  return fromRows(new Map(rows.map((r) => [r.key, r.value])));
});

const bool = z.preprocess(
  (v) => v === true || v === "on" || v === "1" || v === "true",
  z.boolean()
);

const seoSettingsSchema = z.object({
  separator: z.enum(SEPARATORS),
  homeTitle: z.string().trim().max(70),
  homeDescription: z.string().trim().max(200),
  defaultOgImageId: z.string().trim().max(64).optional().default(""),
  twitterHandle: z
    .string()
    .trim()
    .refine((v) => v === "" || HANDLE.test(v), "Invalid handle")
    .transform((v) => v.replace(/^@/, "")),
  noindexSite: bool,
});

/** Validates and stores the SEO settings. Returns the names of the fields that changed. */
export async function saveSeoSettings(input: unknown): Promise<{ changed: string[] }> {
  const parsed = seoSettingsSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const next = parsed.data;
  if (next.defaultOgImageId) {
    const media = await prisma.media.findUnique({
      where: { id: next.defaultOgImageId },
      select: { id: true },
    });
    if (!media)
      throw fromZod(
        new z.ZodError([{ code: "custom", path: ["defaultOgImageId"], message: "Image not found" }])
      );
  }
  const current = await getSeoSettings();
  const value: SeoSettings = {
    separator: next.separator,
    homeTitle: next.homeTitle,
    homeDescription: next.homeDescription,
    defaultOgImageId: next.defaultOgImageId || null,
    twitterHandle: next.twitterHandle,
    noindexSite: next.noindexSite,
  };
  const changed = (Object.keys(value) as (keyof SeoSettings)[]).filter(
    (k) => value[k] !== current[k]
  );
  for (const key of changed) {
    const v = value[key];
    await setSiteSetting(KEYS[key], typeof v === "boolean" ? (v ? "1" : "0") : (v ?? ""));
  }
  return { changed };
}

/** Title template used by the root layout: "%s <separator> Site title". */
export function seoTemplate(siteTitle: string, separator: Separator): string {
  return `%s ${separator} ${siteTitle}`;
}

/** Absolute address of the default share image, or null when none is set. */
export function siteOgImageUrl(
  settings: Pick<SeoSettings, "defaultOgImageId">,
  siteUrl: string
): string | null {
  return settings.defaultOgImageId
    ? `${siteUrl.replace(/\/$/, "")}/media/${encodeURIComponent(settings.defaultOgImageId)}?w=1280`
    : null;
}
