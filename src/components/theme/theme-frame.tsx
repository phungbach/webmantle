import { RenderLayout } from "@/components/theme/render-layout";
import type { RenderContext } from "@/components/theme/types";
import type { ThemeBundle } from "@/lib/themes/registry";
import { contentFor, templateFor } from "@/lib/themes/registry";
import { applyContentOverrides } from "@/lib/themes/content-overrides";
import { buildThemeCss } from "@/lib/themes/settings";
import type { SettingValue } from "@/lib/themes/contract";
import { APPEARANCE_DEFAULTS, activeSeason, appearanceCss } from "@/lib/appearance";
import { MOTION_CSS } from "@/lib/motion";
import { blogStyleCss, BLOG_STYLE_DEFAULTS } from "@/lib/blog-style";
import { DevtoolsGuard } from "@/components/public/devtools-guard";
import { EditBridge } from "@/components/theme/edit-bridge";
import { SeasonOverlay } from "@/components/public/season-overlay";
import { BackToTop } from "@/components/public/back-to-top";

// Minimal dropdown styling for the Appearance → Menu links. Themes may restyle it; this keeps it usable
// for themes that do not know about child links.
const MENU_CSS = `.cms-custom-menu{position:relative;display:inline-block}.cms-custom-menu>summary{cursor:pointer;list-style:none}.cms-custom-menu__panel{position:absolute;top:100%;left:0;z-index:30;display:grid;gap:.125rem;min-width:12rem;padding:.5rem;background:#fff;color:#111827;border:1px solid #e2e8f0;border-radius:.5rem;box-shadow:0 8px 24px rgba(15,23,42,.12)}.cms-custom-menu__panel a{padding:.4rem .6rem;border-radius:.375rem;color:inherit;text-decoration:none}.cms-custom-menu__panel a:hover{background:#f1f5f9}`;

// The banner shown above a preview of an inactive theme. Core-owned, so it looks right in every theme.
const PREVIEW_CSS = `.cms-preview-banner{padding:.6rem 1rem;border-bottom:1px solid #fcd34d;background:#fef3c7;color:#78350f;font:500 .875rem/1.4 system-ui,sans-serif;text-align:center}`;

// Baseline look of the page designer blocks (builder-blocks.tsx). Single-class selectors with theme
// tokens and fallbacks, so a theme can restyle any block with its own rule.
const BUILDER_CSS = `.cms-b--align-left{text-align:left}.cms-b--align-center{text-align:center}.cms-b--align-right{text-align:right}.cms-b-heading{margin:1.5rem auto .75rem;max-width:var(--measure,72rem);padding-inline:1.25rem;font-family:var(--font-heading,inherit);line-height:1.2;color:var(--color-text,#111827)}.cms-b-heading--1{font-size:clamp(2rem,5vw,3rem)}.cms-b-heading--2{font-size:clamp(1.6rem,4vw,2.2rem)}.cms-b-heading--3{font-size:1.4rem}.cms-b-heading--4{font-size:1.15rem}.cms-b-richtext{margin:1rem auto;max-width:var(--measure,72ch);padding-inline:1.25rem;color:var(--color-text,#111827);line-height:1.7}.cms-b-richtext img{max-width:100%;height:auto}.cms-b-image{margin:1.5rem auto;padding-inline:1.25rem;max-width:46rem}.cms-b-image--wide{max-width:72rem}.cms-b-image--full{max-width:none;padding-inline:0}.cms-b-image__img{display:block;width:100%;height:auto}.cms-b-image--rounded .cms-b-image__img{border-radius:1rem}.cms-b-image__caption{margin-top:.5rem;color:var(--color-muted,#64748b);font-size:.875rem;text-align:center}.cms-b-button-wrap{margin:1rem auto;max-width:72rem;padding-inline:1.25rem}.cms-b-button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:.65rem 1.4rem;border:2px solid var(--color-accent,#3b5bdb);border-radius:999px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s ease,color .2s ease}.cms-b-button.cms-b-button--primary{background:var(--color-accent,#3b5bdb);color:#fff}.cms-b-button.cms-b-button--primary:hover{filter:brightness(1.08)}.cms-b-button.cms-b-button--secondary{border-color:var(--color-border,#e2e8f0);background:var(--color-surface,#fff);color:var(--color-text,#111827)}.cms-b-button.cms-b-button--secondary:hover{background:rgba(100,116,139,.12)}.cms-b-button.cms-b-button--outline{background:transparent;color:var(--color-accent,#3b5bdb)}.cms-b-button.cms-b-button--outline:hover{background:var(--color-accent,#3b5bdb);color:#fff}.cms-b-spacer--sm{height:1rem}.cms-b-spacer--md{height:2rem}.cms-b-spacer--lg{height:4rem}.cms-b-spacer--xl{height:6rem}.cms-b-divider{width:calc(100% - 2.5rem);max-width:72rem;margin:2rem auto;border:0;border-top:1px solid var(--color-border,#e2e8f0)}.cms-b-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;max-width:72rem;margin:1.5rem auto;padding:0 1.25rem;list-style:none}.cms-b-gallery__img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.75rem}.cms-b-banner{position:relative;overflow:hidden;padding:clamp(3rem,9vw,7rem) 1.25rem;background:var(--color-surface,#fff);color:var(--color-text,#111827)}.cms-b-banner--tint{background:color-mix(in srgb,var(--color-accent,#3b5bdb) 9%,var(--color-surface,#fff))}.cms-b-banner--dark{background:#111827;color:#fff}.cms-b-banner--accent{background:var(--color-accent,#3b5bdb);color:#fff}.cms-b-banner__bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cms-b-banner--has-image::before{content:"";position:absolute;inset:0;z-index:1;background:rgba(15,23,42,.55)}.cms-b-banner--has-image{color:#fff}.cms-b-banner__inner{position:relative;z-index:2;max-width:56rem;margin:0 auto}.cms-b-banner.cms-b--align-center .cms-b-banner__inner{text-align:center}.cms-b-banner__eyebrow{margin:0 0 .75rem;font-size:.85rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85}.cms-b-banner__title{margin:0;font-family:var(--font-heading,inherit);font-size:clamp(2rem,6vw,3.5rem);line-height:1.1}.cms-b-banner__text{margin:1rem 0 1.75rem;font-size:1.1rem;line-height:1.6;opacity:.92}.cms-b-banner--dark .cms-b-button--primary,.cms-b-banner--accent .cms-b-button--primary,.cms-b-banner--has-image .cms-b-button--primary,.cms-b-cta--dark .cms-b-button--primary,.cms-b-cta--accent .cms-b-button.cms-b-button--primary{border-color:#fff;background:#fff;color:#111827}.cms-b-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;max-width:72rem;margin:1.5rem auto;padding:0 1.25rem;list-style:none}.cms-b-cards__item{overflow:hidden;border:1px solid var(--color-border,#e2e8f0);border-radius:1rem;background:var(--color-surface,#fff)}.cms-b-cards__item .cms-b-cards__link{display:block;height:100%;padding:1.25rem;color:inherit;text-decoration:none}.cms-b-cards__item:not(:has(.cms-b-cards__link)){padding:1.25rem}.cms-b-cards__item .cms-b-cards__link:hover .cms-b-cards__title{color:var(--color-accent,#3b5bdb)}.cms-b-cards__img{display:block;width:calc(100% + 2.5rem);max-width:none;margin:-1.25rem -1.25rem 1rem;aspect-ratio:16/10;object-fit:cover}.cms-b-cards__item:not(:has(.cms-b-cards__link)) .cms-b-cards__img{margin:-1.25rem -1.25rem 1rem}.cms-b-cards__icon{display:inline-flex;margin-bottom:.75rem;color:var(--color-accent,#3b5bdb);font-size:1.5rem}.cms-b-cards__title{margin:0 0 .4rem;font-family:var(--font-heading,inherit);font-size:1.15rem;color:var(--color-text,#111827)}.cms-b-cards__text{margin:0;color:var(--color-muted,#64748b);line-height:1.6}.cms-b-cta{padding:clamp(2.5rem,7vw,4.5rem) 1.25rem;text-align:center}.cms-b-cta--tint{background:color-mix(in srgb,var(--color-accent,#3b5bdb) 9%,var(--color-surface,#fff));color:var(--color-text,#111827)}.cms-b-cta--dark{background:#111827;color:#fff}.cms-b-cta--accent{background:var(--color-accent,#3b5bdb);color:#fff}.cms-b-cta__inner{max-width:44rem;margin:0 auto}.cms-b-cta__title{margin:0;font-family:var(--font-heading,inherit);font-size:clamp(1.6rem,4vw,2.4rem);line-height:1.2}.cms-b-cta__text{margin:.75rem 0 1.5rem;opacity:.92;line-height:1.6}@media (min-width:641px){.cms-b-gallery--3{grid-template-columns:repeat(3,minmax(0,1fr))}.cms-b-gallery--4{grid-template-columns:repeat(4,minmax(0,1fr))}.cms-b-cards--2{grid-template-columns:repeat(2,minmax(0,1fr))}.cms-b-cards--3,.cms-b-cards--4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:961px){.cms-b-cards--3{grid-template-columns:repeat(3,minmax(0,1fr))}.cms-b-cards--4{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (prefers-reduced-motion:reduce){.cms-b-button{transition:none}}`;

// Mobile menu (see mobile-nav.tsx). Applies only below 861px and only after the client component has
// marked the header ready, so the nav stays visible without JavaScript. Selectors are deliberately
// specific so they win over the theme's own nav rules.
const MOBILE_NAV_CSS = `.cms-mobile-nav__toggle{display:none}@media (max-width:860px){.cms-header[data-mobile-nav="ready"] .cms-mobile-nav__toggle{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;margin:0 0 0 auto;padding:0;border:1px solid var(--color-border,#e2e8f0);border-radius:999px;background:transparent;color:var(--color-text,#111827);cursor:pointer}.cms-header[data-mobile-nav="ready"] .cms-mobile-nav__toggle:focus-visible{outline:2px solid var(--color-accent,#2563eb);outline-offset:2px}.cms-header[data-mobile-nav="ready"] .cms-header__nav{position:absolute;top:calc(100% + .5rem);left:0;right:0;z-index:60;display:flex;flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:.125rem;max-height:calc(100vh - 6rem);max-height:calc(100dvh - 6rem);overflow-y:auto;overscroll-behavior:contain;padding:.5rem;border:1px solid var(--color-border,#e2e8f0);border-radius:1rem;background:var(--color-surface,#fff);color:var(--color-text,#111827);box-shadow:0 12px 32px rgba(15,23,42,.16);font-size:1rem;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease,visibility 0s linear .18s}.cms-header[data-mobile-nav="ready"] .cms-header__nav[data-open="true"]{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .18s ease,transform .18s ease,visibility 0s}.cms-header[data-mobile-nav="ready"] .cms-header__nav>a,.cms-header[data-mobile-nav="ready"] .cms-header__nav summary{display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;min-height:48px;margin:0;padding:.75rem 1rem;border:0;border-radius:.75rem;background:transparent;color:var(--color-text,#111827);font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer;list-style:none}.cms-header[data-mobile-nav="ready"] .cms-header__nav summary::-webkit-details-marker{display:none}.cms-header[data-mobile-nav="ready"] .cms-header__nav>a:hover,.cms-header[data-mobile-nav="ready"] .cms-header__nav summary:hover{background:rgba(100,116,139,.12)}.cms-header[data-mobile-nav="ready"] .cms-header__nav>a[aria-current="page"]{background:var(--color-accent,#2563eb);color:var(--color-surface,#fff)}.cms-header[data-mobile-nav="ready"] .cms-header__nav details{position:static;display:block}.cms-header[data-mobile-nav="ready"] .cms-header__nav summary::after{content:"";width:.5rem;height:.5rem;margin:0 .25rem 0 .5rem;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .18s ease}.cms-header[data-mobile-nav="ready"] .cms-header__nav details[open]>summary::after{transform:rotate(-135deg)}.cms-header[data-mobile-nav="ready"] .cms-header__nav details>div{position:static;display:grid;grid-template-columns:1fr;gap:.125rem;width:auto;min-width:0;margin:0 0 .25rem;padding:0 0 0 1rem;border:0;border-left:2px solid var(--color-border,#e2e8f0);border-radius:0;background:transparent;box-shadow:none;transform:none}.cms-header[data-mobile-nav="ready"] .cms-header__nav details>div a{display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;min-height:48px;padding:.6rem 1rem;border-radius:.75rem;color:var(--color-text,#111827);text-decoration:none}.cms-header[data-mobile-nav="ready"] .cms-header__nav details>div a:hover{background:rgba(100,116,139,.12)}.cms-header[data-mobile-nav="ready"] .cms-header__nav .cms-lang{position:static!important;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:48px;margin:.25rem 0 0!important;border-radius:.75rem}}@media (max-width:860px) and (prefers-reduced-motion:reduce){.cms-header[data-mobile-nav="ready"] .cms-header__nav,.cms-header[data-mobile-nav="ready"] .cms-header__nav summary::after{transition:none}}`;

// Boolean and select settings become data-setting-* attributes on the root element. Themes style
// them with attribute selectors, e.g. [data-setting-show-excerpts="false"] .cms-post__excerpt { display: none }.
function settingAttributes(bundle: ThemeBundle, values: Record<string, SettingValue>) {
  const attrs: Record<string, string> = {};
  for (const def of bundle.manifest.settingsSchema) {
    if (def.cssVariable) continue;
    const name = `data-setting-${def.key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    attrs[name] = String(values[def.key]);
  }
  return attrs;
}

/**
 * Wraps one page in a theme: stylesheet link, validated CSS custom properties, and the layout tree.
 * Used by public pages and by the admin preview (preview=true adds a banner, nothing else changes).
 */
export function ThemeFrame({
  bundle,
  values,
  ctx,
  contentOverrides,
}: {
  bundle: ThemeBundle;
  values: Record<string, SettingValue>;
  /** Administrator edits of the theme's content, laid over content.json (whole blocks). */
  contentOverrides?: Record<string, unknown>;
  ctx: Omit<RenderContext, "theme" | "preview"> & { preview?: boolean };
}) {
  const full: RenderContext = {
    ...ctx,
    preview: ctx.preview ?? false,
    content: contentOverrides
      ? applyContentOverrides(contentFor(bundle, ctx.site.locale), contentOverrides)
      : contentFor(bundle, ctx.site.locale),
    theme: { id: bundle.id, version: bundle.version, values },
  };
  const layout =
    full.view.layoutOverride ?? templateFor(bundle, full.view.kind, full.view.templateId);
  const css = buildThemeCss(bundle.manifest.tokens, bundle.manifest.settingsSchema, values);
  const appearance = full.site.appearance ?? APPEARANCE_DEFAULTS;
  const season = activeSeason(appearance.season);
  const blogCss = blogStyleCss(full.site.blogStyle ?? BLOG_STYLE_DEFAULTS);
  const defaultLayout = templateFor(bundle, full.view.kind);
  // Reported on the page so the chosen custom template can be checked (and fallbacks noticed).
  const customUsed =
    !full.view.layoutOverride && layout !== defaultLayout ? full.view.templateId : undefined;
  return (
    <>
      <link
        rel="stylesheet"
        href={`/theme-assets/${bundle.id}/${bundle.version}/styles.css`}
        precedence="theme"
      />
      <style data-theme-vars={bundle.id} dangerouslySetInnerHTML={{ __html: css }} />
      <style data-menu="true" dangerouslySetInnerHTML={{ __html: MENU_CSS }} />
      {full.preview ? (
        <style data-preview="true" dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} />
      ) : null}
      <style data-builder="true" dangerouslySetInnerHTML={{ __html: BUILDER_CSS }} />
      <style data-mobile-nav="true" dangerouslySetInnerHTML={{ __html: MOBILE_NAV_CSS }} />
      {blogCss ? (
        <style data-blog-style="true" dangerouslySetInnerHTML={{ __html: blogCss }} />
      ) : null}
      {appearance.motion === "on" && !full.edit ? (
        <style data-motion="true" dangerouslySetInnerHTML={{ __html: MOTION_CSS }} />
      ) : null}
      <style
        data-appearance="true"
        dangerouslySetInnerHTML={{ __html: appearanceCss(appearance) }}
      />
      <div
        className="cms-theme-root"
        data-theme-id={bundle.id}
        data-theme-version={bundle.version}
        data-custom-template={customUsed}
        {...settingAttributes(bundle, values)}
      >
        <RenderLayout node={layout} ctx={full} />
      </div>
      {full.edit ? <EditBridge /> : <BackToTop label={full.site.locale === "en" ? "Back to top" : "Lên đầu trang"} />}
      {season ? <SeasonOverlay season={season} /> : null}
      {appearance.blockDevtools ? <DevtoolsGuard /> : null}
    </>
  );
}
