"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Icon, type LucideIcon } from "@/components/admin/icon";
import { t, type Locale } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { analyzeSeo, type Check, type CheckStatus } from "@/lib/seo/analysis";
import { resolveSeo, type SeoSource, DESCRIPTION_MAX, TITLE_MAX } from "@/lib/seo/resolve";
import { slugify } from "@/lib/content/slug";

export type SeoMediaOption = { id: string; url: string; alt: string; label: string };

export type SeoPanelInitial = {
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  canonicalUrl: string;
  robots: "index" | "noindex";
  follow: "follow" | "nofollow";
  ogTitle: string;
  ogDescription: string;
  twitterCard: "summary" | "summary_large_image";
  featuredImage: string;
  socialImage: string;
  featuredImageAlt: string;
};

const STATUS_ICON: Record<CheckStatus, LucideIcon> = {
  good: CircleCheck,
  warn: TriangleAlert,
  bad: X,
  info: Info,
};
const STATUS_TONE: Record<CheckStatus, string> = {
  good: "text-success-600",
  warn: "text-warning-600",
  bad: "text-danger-600",
  info: "text-ink-3",
};

/**
 * SEO tab of the post editor. It reads the other tabs' fields from the same form, so the checks,
 * the search preview and the share preview update while the editor types. Nothing is sent anywhere:
 * the checks run in the browser, and the server applies the same rules again on save.
 */
export function SeoPanel({
  locale,
  siteUrl,
  siteHost,
  initial,
  initialTitle,
  initialSlug,
  media,
  canAdvanced,
  baseTitle,
}: {
  locale: Locale;
  siteUrl: string;
  siteHost: string;
  initial: SeoPanelInitial;
  initialTitle: string;
  initialSlug: string;
  media: SeoMediaOption[];
  canAdvanced: boolean;
  baseTitle: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [featuredId, setFeaturedId] = useState(initial.featuredImage);
  const [featuredAlt, setFeaturedAlt] = useState(initial.featuredImageAlt);
  const T = (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);

  // Read the form whenever something in it changes (typing, editor updates, selects).
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const read = () => {
      const data: Record<string, string> = {};
      new FormData(form).forEach((value, key) => {
        if (typeof value === "string") data[key] = value;
      });
      setFields(data);
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, []);

  const get = (key: string, fallback = "") => (key in fields ? fields[key]! : fallback);
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  const title = get("title", initialTitle);
  const slug = get("slug", initialSlug).trim() || slugify(title);
  const featured = mediaById.get(featuredId);
  const social = mediaById.get(get("socialImage", initial.socialImage));

  const source: SeoSource = {
    title,
    slug,
    excerpt: get("excerpt"),
    body: get("body"),
    seoTitle: get("seoTitle", initial.seoTitle),
    seoDescription: get("seoDescription", initial.seoDescription),
    canonicalUrl: canAdvanced ? get("canonicalUrl", initial.canonicalUrl) : initial.canonicalUrl,
    ogTitle: get("ogTitle", initial.ogTitle),
    ogDescription: get("ogDescription", initial.ogDescription),
    robotsIndex: get("robots", initial.robots) !== "noindex",
    robotsFollow: get("follow", initial.follow) !== "nofollow",
    twitterCard: get("twitterCard", initial.twitterCard),
    focusKeyword: get("focusKeyword", initial.focusKeyword),
    featuredImageUrl: featured ? featured.url : null,
    socialImageUrl: social ? social.url : null,
    featuredImageAlt: featuredAlt,
  };
  const seo = resolveSeo(source, siteUrl);
  const analysis = analyzeSeo({ ...source, siteUrl, siteHost });

  const shownSlug = slug;
  const displayUrl = `${siteHost}/posts/${shownSlug}`;

  const checkText = (check: Check): string => {
    const params = check.params as Record<string, string | number>;
    if (check.id === "imagesAlt") {
      const total = Number(params.total ?? 0);
      const missing = Number(params.missing ?? 0);
      return T("seo.check.imagesAlt", { ok: total - missing, total });
    }
    if (check.id === "keywordDensity") {
      return T("seo.check.keywordDensity", { percent: String(params.percent ?? 0) });
    }
    return T(`seo.check.${check.id}` as MessageKey, { ...params, max: maxFor(check.id) });
  };
  const maxFor = (id: string) =>
    id === "descriptionLength" ? DESCRIPTION_MAX : id === "titleLength" ? TITLE_MAX : 0;

  const counter = (value: string, max: number) => (
    <span className="text-xs text-ink-3">{T("seo.counter", { count: value.length, max })}</span>
  );

  const inputClass =
    "w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-subtle disabled:text-ink-3";
  const labelClass = "mb-1 block text-sm font-medium text-ink-2";

  return (
    <div ref={root} className="space-y-6">
      {/* Search preview */}
      <section className="rounded-lg border border-line bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-2">{T("seo.serpTitle")}</h3>
        <div className="max-w-xl space-y-1 rounded-control bg-canvas p-4 font-sans">
          <p className="truncate text-xs text-ink-2">{displayUrl}</p>
          <p className="truncate text-lg text-brand-700">{seo.title || baseTitle}</p>
          <p className="line-clamp-2 text-sm text-ink-2">{seo.description || "—"}</p>
        </div>
      </section>

      {/* Basic */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink-2">{T("seo.basic")}</h3>
        <label className="block">
          <span className={labelClass}>{T("seo.seoTitle")}</span>
          <input
            name="seoTitle"
            defaultValue={initial.seoTitle}
            maxLength={70}
            placeholder={title}
            className={inputClass}
          />
          <span className="mt-1 flex justify-between">
            <span className="text-xs text-ink-3">{T("seo.defaultHint")}</span>
            {counter(get("seoTitle", initial.seoTitle), TITLE_MAX)}
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>{T("seo.metaDescription")}</span>
          <textarea
            name="seoDescription"
            defaultValue={initial.seoDescription}
            rows={3}
            maxLength={200}
            placeholder={seo.description}
            className={inputClass}
          />
          <span className="mt-1 flex justify-between">
            <span className="text-xs text-ink-3">{T("seo.defaultHint")}</span>
            {counter(get("seoDescription", initial.seoDescription), DESCRIPTION_MAX)}
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>{T("seo.focusKeyword")}</span>
          <input
            name="focusKeyword"
            defaultValue={initial.focusKeyword}
            maxLength={60}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-ink-3">{T("seo.focusKeywordHint")}</span>
        </label>
      </section>

      {/* Advanced: only editors and admins may change these */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink-2">{T("seo.advanced")}</h3>
        {!canAdvanced ? <p className="text-xs text-ink-3">{T("seo.advancedOnly")}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{T("seo.robots")}</span>
            <select
              name="robots"
              defaultValue={initial.robots}
              disabled={!canAdvanced}
              className={inputClass}
            >
              <option value="index">{T("seo.robotsIndex")}</option>
              <option value="noindex">{T("seo.robotsNoindex")}</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>&nbsp;</span>
            <select
              name="follow"
              defaultValue={initial.follow}
              disabled={!canAdvanced}
              className={inputClass}
            >
              <option value="follow">{T("seo.follow")}</option>
              <option value="nofollow">{T("seo.nofollow")}</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>{T("seo.canonical")}</span>
          <input
            name="canonicalUrl"
            type="url"
            defaultValue={initial.canonicalUrl}
            disabled={!canAdvanced}
            placeholder={`${siteUrl}/posts/${shownSlug}`}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-ink-3">{T("seo.canonicalHint")}</span>
        </label>
        <label className="block">
          <span className={labelClass}>{T("seo.twitterCard")}</span>
          <select
            name="twitterCard"
            defaultValue={initial.twitterCard}
            disabled={!canAdvanced}
            className={inputClass}
          >
            <option value="summary_large_image">{T("seo.cardLarge")}</option>
            <option value="summary">{T("seo.cardSummary")}</option>
          </select>
        </label>
      </section>

      {/* Sharing */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink-2">{T("seo.social")}</h3>
        <label className="block">
          <span className={labelClass}>{T("seo.ogTitle")}</span>
          <input
            name="ogTitle"
            defaultValue={initial.ogTitle}
            maxLength={95}
            placeholder={seo.title}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{T("seo.ogDescription")}</span>
          <textarea
            name="ogDescription"
            defaultValue={initial.ogDescription}
            rows={2}
            maxLength={200}
            placeholder={seo.description}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{T("seo.shareImage")}</span>
          <select
            name="socialImage"
            defaultValue={initial.socialImage}
            disabled={!canAdvanced}
            className={inputClass}
          >
            <option value="">{T("seo.featuredImageNone")}</option>
            {media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-3">{T("seo.shareImageHint")}</span>
        </label>
        <div className="flex max-w-md gap-3 overflow-hidden rounded-control border border-line bg-white">
          {seo.ogImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded image
            <img
              src={social?.url ?? featured?.url ?? ""}
              alt=""
              className="h-24 w-24 shrink-0 object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-subtle text-xs text-ink-3">
              —
            </div>
          )}
          <div className="min-w-0 py-2 pr-3">
            <p className="truncate text-xs text-ink-3">{siteHost}</p>
            <p className="truncate text-sm font-semibold">{seo.ogTitle}</p>
            <p className="line-clamp-2 text-xs text-ink-2">{seo.ogDescription}</p>
          </div>
        </div>
      </section>

      {/* Featured image and its alt text */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink-2">{T("seo.image")}</h3>
        <label className="block">
          <span className={labelClass}>{T("seo.featuredImage")}</span>
          <select
            name="featuredImage"
            value={featuredId}
            onChange={(e) => {
              setFeaturedId(e.target.value);
              setFeaturedAlt(mediaById.get(e.target.value)?.alt ?? "");
            }}
            className={inputClass}
          >
            <option value="">{T("seo.featuredImageNone")}</option>
            {media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {featured ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded image
          <img src={featured.url} alt="" className="h-32 rounded-control object-cover" />
        ) : null}
        <label className="block">
          <span className={labelClass}>{T("seo.featuredImageAlt")}</span>
          <input
            name="featuredImageAlt"
            value={featuredAlt}
            onChange={(e) => setFeaturedAlt(e.target.value)}
            maxLength={300}
            disabled={!featured}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-ink-3">{T("seo.featuredImageAltHint")}</span>
        </label>
      </section>

      {/* Analysis */}
      <section className="space-y-3 rounded-lg border border-line bg-white p-4">
        <h3 className="text-sm font-semibold text-ink-2">{T("seo.analysis")}</h3>
        <p className="text-xs text-ink-3">{T("seo.analysisNote")}</p>
        <p className="text-sm font-medium">
          {T("seo.summary", {
            good: analysis.counts.good,
            warn: analysis.counts.warn,
            bad: analysis.counts.bad,
          })}
        </p>
        <ul className="space-y-2 text-sm">
          {analysis.checks.map((check, index) => (
            <li key={`${check.id}-${index}`} className="flex items-start gap-2">
              <Icon
                icon={STATUS_ICON[check.status]}
                className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_TONE[check.status]}`}
                title={T(`seo.status.${check.status}` as MessageKey)}
              />
              <span>{checkText(check)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
