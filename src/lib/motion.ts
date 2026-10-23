/**
 * Site-wide motion: a few small animations that apply on top of whichever theme is active, written in
 * plain CSS so no script runs. Everything sits behind `prefers-reduced-motion: no-preference`, and the
 * scroll-driven parts also behind `@supports (animation-timeline: view())`, so browsers that do not
 * know them (or visitors who ask for less motion) get the plain page. The effects use the individual
 * `translate` property, so a theme's own `transform` on hover still works.
 */

/** Elements that fade and rise into place while they scroll into view. */
const REVEAL = [
  ".cms-title",
  ".cms-mkt__heading",
  ".cms-mkt__grid > *",
  ".cms-mkt__checklist > li",
  ".cms-mkt__stat",
  ".cms-mkt__logos > *",
  ".cms-mkt--cta",
  ".cms-post-list > *",
  ".cms-b-cards__item",
  ".cms-b-image",
  ".cms-b-gallery > li",
]
  .map((s) => `.cms-theme-root ${s}`)
  .join(",");

export const MOTION_CSS = `
@media (prefers-reduced-motion:no-preference){
html{scroll-behavior:smooth}
@keyframes cms-page-in{from{opacity:0}to{opacity:1}}
.cms-theme-root{animation:cms-page-in .45s ease-out both}
.cms-theme-root :is(.cms-mkt__button,.cms-b-button,.cms-mkt__course,.cms-mkt__plan,.cms-b-cards__item,.cms-post){transition:transform .22s ease,box-shadow .22s ease,filter .22s ease}
.cms-theme-root :is(.cms-mkt__course,.cms-mkt__plan,.cms-b-cards__item,.cms-post):hover{transform:translateY(-4px);box-shadow:0 14px 32px rgba(15,23,42,.12)}
.cms-theme-root :is(.cms-mkt__button,.cms-b-button):hover{transform:translateY(-1px)}
.cms-theme-root :is(.cms-mkt__button,.cms-b-button):active{transform:scale(.97)}
}
@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){
@keyframes cms-reveal{from{opacity:0;translate:0 28px}to{opacity:1;translate:0 0}}
@keyframes cms-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes cms-header-shadow{from{box-shadow:0 0 0 rgba(15,23,42,0)}to{box-shadow:0 6px 22px rgba(15,23,42,.1)}}
${REVEAL}{animation:cms-reveal linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
.cms-theme-root :is(.cms-mkt__grid,.cms-mkt__checklist,.cms-post-list)>:nth-child(3n+2){animation-range:entry 6% entry 61%}
.cms-theme-root :is(.cms-mkt__grid,.cms-mkt__checklist,.cms-post-list)>:nth-child(3n+3){animation-range:entry 12% entry 67%}
.cms-theme-root::before{content:"";position:fixed;top:0;left:0;right:0;z-index:80;height:3px;background:var(--color-accent,#3b5bdb);transform-origin:0 50%;transform:scaleX(0);pointer-events:none;animation:cms-progress linear both;animation-timeline:scroll(root)}
.cms-theme-root .cms-header{animation:cms-header-shadow linear both;animation-timeline:scroll(root);animation-range:0 140px}
}}
`;
