import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { getBlogStyle } from "@/lib/blog-style";
import { getSiteSettings } from "@/lib/settings";
import { createPreviewToken } from "@/lib/themes/preview-token";
import { FALLBACK_THEME_ID } from "@/lib/themes/registry";
import { Button, Card, Flash } from "@/components/admin/ui";
import { PanelHeading } from "@/components/admin/settings/panel-heading";
import { saveBlogStyleAction } from "@/app/admin/actions/blog-style";

const card =
  "cursor-pointer rounded-lg border border-line p-3 text-sm transition hover:border-line-strong has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600";

/** Blog look for every theme: list layout, card style, title and text size, and widths. */
export async function BlogStylePanel({ params }: { params: Record<string, string | undefined> }) {
  const locale = await getLocale();
  const T = tr(locale);
  const [style, settings] = await Promise.all([getBlogStyle(), getSiteSettings()]);
  const previewId = settings.activeThemeId ?? FALLBACK_THEME_ID;
  const previewUrl = `/preview/${previewId}?t=${createPreviewToken(previewId)}`;

  const radio = (name: string, value: string, label: string, checked: boolean) => (
    <label key={value} className={card}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mr-2" />
      {label}
    </label>
  );

  return (
    <>
      <PanelHeading title={T("blogStyle.title")} description={T("blogStyle.description")} />
      <Flash ok={params.ok} error={params.error} />

      <Card className="max-w-3xl space-y-7">
        <form action={saveBlogStyleAction} className="space-y-7">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("blogStyle.listLayout")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["theme", T("blogStyle.optTheme")],
                ["list", T("blogStyle.layoutList")],
                ["grid", T("blogStyle.layoutGrid")],
              ].map(([v, l]) => radio("listLayout", v!, l!, style.listLayout === v))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("blogStyle.cardStyle")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["theme", T("blogStyle.optTheme")],
                ["flat", T("blogStyle.cardFlat")],
                ["card", T("blogStyle.cardBox")],
                ["raised", T("blogStyle.cardRaised")],
              ].map(([v, l]) => radio("cardStyle", v!, l!, style.cardStyle === v))}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-ink-2">{T("blogStyle.cardRadius")}</span>
              <input
                type="range"
                name="cardRadius"
                min={0}
                max={24}
                defaultValue={style.cardRadius}
                className="w-48"
              />
              <span className="text-xs text-ink-3">{T("blogStyle.cardRadiusHint")}</span>
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-ink-2">
              {T("blogStyle.visible")}
            </legend>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="showImages" defaultChecked={style.showImages} />
              {T("blogStyle.showImages")}
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="showExcerpts" defaultChecked={style.showExcerpts} />
              {T("blogStyle.showExcerpts")}
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("blogStyle.titleSize")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["theme", T("blogStyle.optTheme")],
                ["small", T("blogStyle.sizeSmall")],
                ["medium", T("blogStyle.sizeMedium")],
                ["large", T("blogStyle.sizeLarge")],
              ].map(([v, l]) => radio("titleSize", v!, l!, style.titleSize === v))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("blogStyle.listWidth")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["theme", T("blogStyle.optTheme")],
                ["narrow", T("blogStyle.widthNarrow")],
                ["content", T("blogStyle.widthContent")],
                ["wide", T("blogStyle.widthWide")],
              ].map(([v, l]) => radio("listWidth", v!, l!, style.listWidth === v))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("blogStyle.articleWidth")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["theme", T("blogStyle.optTheme")],
                ["narrow", T("blogStyle.widthNarrow")],
                ["content", T("blogStyle.widthContent")],
                ["wide", T("blogStyle.widthWide")],
              ].map(([v, l]) => radio("articleWidth", v!, l!, style.articleWidth === v))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("blogStyle.bodySize")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["theme", T("blogStyle.optTheme")],
                ["medium", T("blogStyle.sizeMedium")],
                ["large", T("blogStyle.sizeLarge")],
              ].map(([v, l]) => radio("bodySize", v!, l!, style.bodySize === v))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <Button>{T("blogStyle.save")}</Button>
            <Link href={previewUrl} target="_blank" className="text-sm underline">
              {T("blogStyle.preview")}
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
