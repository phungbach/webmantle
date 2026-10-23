import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { getSeoSettings, SEPARATORS } from "@/lib/seo/site";
import { getSeoHealth } from "@/lib/admin/seo-health";
import { saveSeoSettingsAction } from "@/app/admin/actions/seo";
import { Badge, Button, Card, Flash } from "@/components/admin/ui";
import { PanelHeading } from "@/components/admin/settings/panel-heading";
import { SeoForm } from "@/components/admin/settings/seo-form";
import { SITE_URL } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export async function SeoPanel({ params }: { params: Record<string, string | undefined> }) {
  const T = tr(await getLocale());
  const [site, seo, media, health] = await Promise.all([
    getSiteSettings(),
    getSeoSettings(),
    prisma.media.findMany({
      where: { mimeType: { in: ["image/jpeg", "image/png", "image/webp"] } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, altText: true },
    }),
    getSeoHealth(),
  ]);
  // Keep the chosen image selectable even when it is older than the 24 most recent.
  const mediaList = media.map((m) => ({ id: m.id, alt: m.altText }));
  if (seo.defaultOgImageId && !mediaList.some((m) => m.id === seo.defaultOgImageId)) {
    mediaList.unshift({ id: seo.defaultOgImageId, alt: "" });
  }

  const issueLabel = {
    noDescription: T("seoHub.issueNoDescription"),
    descriptionLength: T("seoHub.issueDescriptionLength"),
    noImage: T("seoHub.issueNoImage"),
    longTitle: T("seoHub.issueLongTitle"),
    duplicateTitle: T("seoHub.issueDuplicateTitle"),
    noindex: T("seoHub.issueNoindex"),
  } as const;

  return (
    <>
      <PanelHeading
        title={T("seoHub.title")}
        description={T("seoHub.description")}
        action={<Button form="seo-form">{T("settings.saveChanges")}</Button>}
      />
      <Flash ok={params.ok} error={params.error} />
      <form id="seo-form" action={saveSeoSettingsAction}>
        <SeoForm
          siteTitle={site.siteTitle}
          siteDescription={site.siteDescription}
          siteUrl={SITE_URL}
          separators={SEPARATORS}
          initial={{
            separator: seo.separator,
            homeTitle: seo.homeTitle,
            homeDescription: seo.homeDescription,
            defaultOgImageId: seo.defaultOgImageId ?? "",
            twitterHandle: seo.twitterHandle,
            noindexSite: seo.noindexSite,
          }}
          media={mediaList}
          labels={{
            cardHome: T("seoHub.cardHome"),
            separator: T("seoHub.separator"),
            separatorExample: T("seoHub.separatorExample"),
            homeTitle: T("seoHub.homeTitle"),
            homeDescription: T("seoHub.homeDescription"),
            counterTitle: T("seo.counter"),
            counterDescription: T("seo.counter"),
            serpPreview: T("seoHub.serpPreview"),
            cardSocial: T("seoHub.cardSocial"),
            shareImage: T("seoHub.shareImage"),
            shareImageHint: T("seoHub.shareImageHint"),
            noImage: T("seoHub.noImage"),
            noMedia: T("seoHub.noMedia"),
            twitterHandle: T("seoHub.twitterHandle"),
            twitterHandleHint: T("seoHub.twitterHandleHint"),
            socialPreview: T("seoHub.socialPreview"),
            cardIndexing: T("seoHub.cardIndexing"),
            noindex: T("seoHub.noindex"),
            noindexWarning: T("seoHub.noindexWarning"),
            sitemap: T("seoHub.sitemap"),
            robots: T("seoHub.robots"),
          }}
        />
      </form>

      <Card className="mt-5">
        <h2 className="text-base font-semibold text-ink">{T("seoHub.healthTitle")}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {T("seoHub.healthSummary", { ok: health.passing, total: health.total })}
        </p>
        <ul className="mt-4 divide-y divide-line">
          {health.issues.map((issue) => (
            <li key={issue.id} className="py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink">{issueLabel[issue.id]}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-3">{issue.count}</span>
                  <Badge tone={issue.count === 0 ? "success" : "warning"}>
                    {issue.count === 0 ? T("seoHub.ok") : T("seoHub.warn")}
                  </Badge>
                </span>
              </div>
              {issue.examples.length > 0 ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-brand-600">
                    {T("seoHub.examples")}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {issue.examples.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/admin/posts/${p.id}`}
                          className="text-ink-2 hover:text-ink hover:underline"
                        >
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
