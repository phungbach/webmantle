"use client";

import { useState } from "react";
import { Card } from "@/components/admin/ui";

export type SeoFormLabels = {
  cardHome: string;
  separator: string;
  separatorExample: string;
  homeTitle: string;
  homeDescription: string;
  counterTitle: string;
  counterDescription: string;
  serpPreview: string;
  cardSocial: string;
  shareImage: string;
  shareImageHint: string;
  noImage: string;
  noMedia: string;
  twitterHandle: string;
  twitterHandleHint: string;
  socialPreview: string;
  cardIndexing: string;
  noindex: string;
  noindexWarning: string;
  sitemap: string;
  robots: string;
};

type Props = {
  labels: SeoFormLabels;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  separators: readonly string[];
  initial: {
    separator: string;
    homeTitle: string;
    homeDescription: string;
    defaultOgImageId: string;
    twitterHandle: string;
    noindexSite: boolean;
  };
  media: { id: string; alt: string }[];
};

const control =
  "w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

function Counter({
  id,
  text,
  count,
  recommended,
  max,
}: {
  id: string;
  text: string;
  count: number;
  recommended: number;
  max: number;
}) {
  const tone =
    count > max ? "text-danger-600" : count > recommended ? "text-warning-600" : "text-ink-3";
  return (
    <span id={id} className={`mt-1 block text-xs ${tone}`}>
      {text.replace("{count}", String(count)).replace("{max}", String(recommended))}
    </span>
  );
}

/** The SEO form with live counters and previews. Only plain controlled inputs, no server round trip. */
export function SeoForm({
  labels,
  siteTitle,
  siteDescription,
  siteUrl,
  separators,
  initial,
  media,
}: Props) {
  const [separator, setSeparator] = useState(initial.separator);
  const [title, setTitle] = useState(initial.homeTitle);
  const [description, setDescription] = useState(initial.homeDescription);
  const [imageId, setImageId] = useState(initial.defaultOgImageId);
  const [handle, setHandle] = useState(initial.twitterHandle);
  const [noindex, setNoindex] = useState(initial.noindexSite);

  const shownTitle = title.trim() || siteTitle;
  const shownDescription = description.trim() || siteDescription;
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-4 text-base font-semibold text-ink">{labels.cardHome}</h2>
        <div className="grid gap-x-5 gap-y-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {labels.separator}
              </span>
              <select
                name="separator"
                value={separator}
                onChange={(e) => setSeparator(e.target.value)}
                aria-describedby="seo-separator-example"
                className={control}
              >
                {separators.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span id="seo-separator-example" className="mt-1 block text-xs text-ink-3">
                {labels.separatorExample} {separator} {siteTitle}
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {labels.homeTitle}
              </span>
              <input
                name="homeTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={siteTitle}
                maxLength={70}
                aria-describedby="seo-title-count"
                className={control}
              />
              <Counter
                id="seo-title-count"
                text={labels.counterTitle}
                count={title.length}
                recommended={60}
                max={70}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {labels.homeDescription}
              </span>
              <textarea
                name="homeDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={siteDescription}
                rows={3}
                maxLength={200}
                aria-describedby="seo-desc-count"
                className={control}
              />
              <Counter
                id="seo-desc-count"
                text={labels.counterDescription}
                count={description.length}
                recommended={160}
                max={200}
              />
            </label>
          </div>
          <div aria-live="polite">
            <p className="mb-2 text-[13px] font-medium text-ink">{labels.serpPreview}</p>
            <div className="rounded-control border border-line bg-white p-4">
              <p className="truncate text-xs text-ink-2">{host}</p>
              <p className="mt-1 text-lg leading-snug text-[#1a0dab]">{clip(shownTitle, 60)}</p>
              <p className="mt-1 text-sm text-ink-2">{clip(shownDescription, 160)}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-ink">{labels.cardSocial}</h2>
        <div className="grid gap-x-5 gap-y-4 lg:grid-cols-2">
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-1 block text-[13px] font-medium text-ink">
                {labels.shareImage}
              </legend>
              <p className="mb-2 text-xs text-ink-3">{labels.shareImageHint}</p>
              <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="defaultOgImageId"
                    value=""
                    checked={imageId === ""}
                    onChange={() => setImageId("")}
                    className="peer sr-only"
                  />
                  <span className="flex aspect-[1.91/1] items-center justify-center rounded-control border border-line-strong px-1 text-center text-xs text-ink-2 peer-checked:border-brand-600 peer-checked:ring-2 peer-checked:ring-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600">
                    {labels.noImage}
                  </span>
                </label>
                {media.map((m) => (
                  <label key={m.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="defaultOgImageId"
                      value={m.id}
                      checked={imageId === m.id}
                      onChange={() => setImageId(m.id)}
                      className="peer sr-only"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the CMS media route */}
                    <img
                      src={`/media/${m.id}?w=320`}
                      alt={m.alt}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[1.91/1] w-full rounded-control border border-line-strong object-cover peer-checked:border-brand-600 peer-checked:ring-2 peer-checked:ring-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600"
                    />
                  </label>
                ))}
              </div>
              {media.length === 0 ? (
                <p className="mt-2 text-xs text-ink-3">{labels.noMedia}</p>
              ) : null}
            </fieldset>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {labels.twitterHandle}
              </span>
              <input
                name="twitterHandle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@handle"
                maxLength={16}
                pattern="@?[A-Za-z0-9_]{1,15}"
                aria-describedby="seo-handle-hint"
                className={control}
              />
              <span id="seo-handle-hint" className="mt-1 block text-xs text-ink-3">
                {labels.twitterHandleHint}
              </span>
            </label>
          </div>
          <div aria-live="polite">
            <p className="mb-2 text-[13px] font-medium text-ink">{labels.socialPreview}</p>
            <div className="max-w-md overflow-hidden rounded-control border border-line bg-white">
              {imageId ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by the CMS media route
                <img
                  src={`/media/${imageId}?w=640`}
                  alt=""
                  className="aspect-[1.91/1] w-full object-cover"
                />
              ) : (
                <div className="aspect-[1.91/1] w-full bg-subtle" />
              )}
              <div className="p-3">
                <p className="truncate text-xs uppercase text-ink-3">{host}</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-ink">
                  {clip(shownTitle, 60)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">
                  {clip(shownDescription, 160)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-ink">{labels.cardIndexing}</h2>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="noindexSite"
            checked={noindex}
            onChange={(e) => setNoindex(e.target.checked)}
            aria-describedby={noindex ? "seo-noindex-warning" : undefined}
          />
          {labels.noindex}
        </label>
        {noindex ? (
          <p
            id="seo-noindex-warning"
            role="alert"
            className="mt-3 rounded-control border border-warning-600/30 bg-warning-50 px-3 py-2 text-sm font-medium text-warning-600"
          >
            {labels.noindexWarning}
          </p>
        ) : null}
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener"
            className="font-medium text-brand-600 hover:underline"
          >
            {labels.sitemap}
          </a>
          <a
            href="/robots.txt"
            target="_blank"
            rel="noopener"
            className="font-medium text-brand-600 hover:underline"
          >
            {labels.robots}
          </a>
        </p>
      </Card>
    </div>
  );
}
