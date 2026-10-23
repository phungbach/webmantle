import type { MenuItem } from "@/lib/menu";
import { type BuilderName, builderComponents } from "./builder-blocks";
import { MobileNav } from "./mobile-nav";
import { ICONS } from "./marketing";
import { responsiveImage } from "./responsive-image";
import Link from "next/link";
import type { z } from "zod";
import { formatDate } from "@/lib/format";
import {
  DuotoneIcon,
  faArrowLeft,
  faArrowRight,
  faCalendar,
  faGlobe,
  faHouse,
  faMagnifyingGlass,
  faRss,
  faUser,
} from "@/components/icons";
import { t, pluralKey, isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { PostCard } from "@/lib/content/queries";
import type { RenderContext } from "@/components/theme/types";
import { COMPONENT_PROPS, type ComponentName } from "@/lib/themes/contract";
import { footerSchema, titleBlockSchema, navItemSchema } from "@/lib/themes/content-schemas";
import { withHeadingIds } from "@/lib/content/headings";
import {
  ContentImg,
  Hn,
  block,
  entries,
  type MarketingName,
  marketingComponents,
} from "@/components/theme/marketing";
import { ce, cePath } from "@/components/theme/content-edit";

// Core-owned components. Themes choose which of these to use, in what order, and how to style them
// through CSS classes and custom properties. Themes cannot add components or change their markup.
// Text comes from the message dictionary in the visitor's language.

/** Logo size is set inline: the global reset (height: auto) and themes must not stretch it. */
const LOGO_STYLE = (height: number): React.CSSProperties => ({
  height,
  width: "auto",
  maxWidth: "100%",
  display: "inline-block",
  verticalAlign: "middle",
});

type Props<N extends ComponentName> = z.infer<(typeof COMPONENT_PROPS)[N]>;

function localeOf(ctx: RenderContext): Locale {
  const value = ctx.site.locale;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The only place rich HTML is rendered. Input is always sanitized before it is stored. */
export function SafeHtml({ html, className }: { html: string; className: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PostItem({
  post,
  variant,
  showExcerpt = true,
  locale,
}: {
  post: PostCard;
  variant: "card" | "featured" | "compact" | "related";
  showExcerpt?: boolean;
  locale: Locale;
}) {
  return (
    <article className={`cms-post cms-post--${variant}`} data-post-id={post.id}>
      {post.featuredImageUrl && variant !== "compact" ? (
        // Media is served from our own route; the alt text comes from the library when available.
        // eslint-disable-next-line @next/next/no-img-element -- themes render their own image markup
        <img
          className="cms-post__image"
          src={post.featuredImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          {...responsiveImage(
            post.featuredImageUrl,
            variant === "featured"
              ? "(max-width: 768px) 100vw, 800px"
              : "(max-width: 768px) 100vw, 400px"
          )}
        />
      ) : null}
      <h2 className="cms-post__title">
        <Link href={post.url}>{post.title}</Link>
      </h2>
      <p className="cms-post__meta">
        {post.categories[0] ? (
          // Hidden by default. A theme can show the first category as a tag above the title.
          <Link className="cms-post__tag" href={`/categories/${post.categories[0].slug}`} hidden>
            {post.categories[0].name}
          </Link>
        ) : null}
        <time dateTime={post.publishedAt} className="cms-icon-text">
          <DuotoneIcon icon={faCalendar} className="cms-icon" gap />
          {formatDate(post.publishedAt, locale)}
        </time>
        <span className="cms-post__sep"> · </span>
        <Link href={`/authors/${post.author.slug}`} className="cms-icon-text cms-post__author">
          <DuotoneIcon icon={faUser} className="cms-icon" gap />
          {post.author.name}
        </Link>
        <span className="cms-post__read" hidden>
          {t(locale, "post.minRead", { minutes: post.readMinutes })}
        </span>
      </p>
      {showExcerpt && variant !== "compact" && post.excerpt ? (
        <p className="cms-post__excerpt">{post.excerpt}</p>
      ) : null}
      <Link className="cms-post__more" href={post.url}>
        {t(locale, "post.readMore")} <DuotoneIcon icon={faArrowRight} className="cms-icon" />
      </Link>
    </article>
  );
}

/** The main menu set in Appearance → Menu. Child links open from a dropdown under their parent. */
/** Share links that need no script: Facebook, X and email. */
function shareLinks(url: string, title: string, locale: Locale) {
  const u = encodeURIComponent(url);
  const ti = encodeURIComponent(title);
  return [
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      external: true,
    },
    { label: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${ti}`, external: true },
    {
      label: t(locale, "post.shareEmail"),
      href: `mailto:?subject=${ti}&body=${u}`,
      external: false,
    },
  ];
}

function CustomMenu({ items, ctx }: { items: MenuItem[]; ctx: RenderContext }) {
  return (
    <>
      {items.map((item) =>
        item.children.length > 0 ? (
          <details key={item.label} className="cms-custom-menu">
            <summary>{item.label}</summary>
            <div className="cms-custom-menu__panel">
              {item.children.map((child) => (
                <Link key={child.label} href={child.href}>
                  {child.label}
                </Link>
              ))}
            </div>
          </details>
        ) : (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isCurrent(item.href, ctx) ? "page" : undefined}
          >
            {item.label}
          </Link>
        )
      )}
    </>
  );
}

function navLabels(locale: Locale) {
  return {
    label: t(locale, "nav.mainLabel"),
    openLabel: t(locale, "nav.menuOpen"),
    closeLabel: t(locale, "nav.menuClose"),
  };
}

/** Switches to the other language and returns to the same page (the route reads the Referer). */
function LanguageSwitch({ locale }: { locale: Locale }) {
  const other: Locale = locale === "vi" ? "en" : "vi";
  // A plain link, not next/link: the route sets a cookie and redirects back. A client-side
  // navigation would reuse the cached page and show the old language, so the browser loads it fresh.
  // The two language codes are hidden by default; a theme can show them to draw a VI | EN switch.
  return (
    <a
      className="cms-lang"
      href={`/language?lang=${other}`}
      rel="nofollow"
      hrefLang={other}
      lang={other}
      data-locale={locale}
    >
      <span className="cms-lang__code cms-lang__code--on" aria-hidden="true" hidden>
        {locale.toUpperCase()}
      </span>
      <span className="cms-lang__code" aria-hidden="true" hidden>
        {other.toUpperCase()}
      </span>
      <DuotoneIcon icon={faGlobe} className="cms-icon" />{" "}
      <span className="cms-lang__name">{t(locale, "nav.language")}</span>
    </a>
  );
}

/** Address of the page being shown, when a menu link can point at it. */
function currentPath(ctx: RenderContext): string | null {
  const { view } = ctx;
  if (view.kind === "home") return "/";
  if (view.kind === "page" && view.page) return `/pages/${view.page.slug}`;
  return null;
}

function isCurrent(href: string, ctx: RenderContext): boolean {
  const here = currentPath(ctx);
  return here !== null && href.replace(/\/$/, "") === here.replace(/\/$/, "") && here !== "/";
}

export type ComponentMap = {
  [N in ComponentName]: (args: {
    props: Props<N>;
    ctx: RenderContext;
    children?: React.ReactNode;
  }) => React.ReactNode;
};

const coreComponents: Omit<ComponentMap, MarketingName | BuilderName> = {
  Shell: ({ children, ctx }) => {
    const locale = localeOf(ctx);
    return (
      <div className="cms-shell" data-template={ctx.view.kind}>
        {ctx.preview ? (
          <div className="cms-preview-banner" role="status">
            {t(locale, "preview.banner")}
          </div>
        ) : null}
        {children}
      </div>
    );
  },

  Section: ({ props, children }) => (
    <section className={`cms-section cms-section--${props.width} cms-section--tone-${props.tone}`}>
      {children}
    </section>
  ),

  Grid: ({ props, children }) => (
    <div className={`cms-grid cms-grid--cols-${props.columns} cms-grid--gap-${props.gap}`}>
      {children}
    </div>
  ),

  Stack: ({ props, children }) => (
    <div className={`cms-stack cms-stack--${props.gap}`}>{children}</div>
  ),

  SiteHeader: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    if (props.variant === "mega") return <MegaHeader ctx={ctx} />;
    return (
      <header className={`cms-header cms-header--${props.variant}`}>
        <Link className="cms-header__brand" href="/">
          {ctx.site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo served by the CMS media route
            <img
              className="cms-header__logo"
              src={ctx.site.logoUrl}
              alt=""
              style={LOGO_STYLE(36)}
            />
          ) : null}
          {ctx.site.title}
        </Link>
        <MobileNav {...navLabels(locale)}>
          {ctx.site.menu?.length ? (
            <CustomMenu items={ctx.site.menu} ctx={ctx} />
          ) : (
            <>
              <Link href="/">
                <DuotoneIcon icon={faHouse} className="cms-icon" /> {t(locale, "nav.home")}
              </Link>
              <Link href="/search">
                <DuotoneIcon icon={faMagnifyingGlass} className="cms-icon" />{" "}
                {t(locale, "nav.search")}
              </Link>
              <Link href="/feed.xml">
                <DuotoneIcon icon={faRss} className="cms-icon" /> {t(locale, "nav.feed")}
              </Link>
            </>
          )}
          <LanguageSwitch locale={locale} />
        </MobileNav>
      </header>
    );
  },

  SiteFooter: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    const footer = props.variant === "columns" ? block(ctx, "footer", footerSchema) : null;
    if (footer) return <ContentFooter ctx={ctx} footer={footer} />;
    return (
      <footer className={`cms-footer cms-footer--${props.variant}`}>
        {ctx.site.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo served by the CMS media route
          <img className="cms-footer__logo" src={ctx.site.logoUrl} alt="" style={LOGO_STYLE(40)} />
        ) : null}
        <p className="cms-footer__title">{ctx.site.title}</p>
        {props.variant === "columns" ? (
          <p className="cms-footer__description">{ctx.site.description}</p>
        ) : null}
        <p className="cms-footer__copy">
          {t(locale, "footer.copy", { year: new Date().getUTCFullYear(), title: ctx.site.title })}
        </p>
      </footer>
    );
  },

  Breadcrumbs: ({ ctx }) => {
    const locale = localeOf(ctx);
    const v = ctx.view;
    if (v.kind === "home" || v.kind === "not-found") return null;
    const trail: { label: string; href?: string }[] = [
      { label: t(locale, "breadcrumb.home"), href: "/" },
    ];
    if (v.kind === "single-post" && v.post) {
      if (v.post.categories[0]) {
        trail.push({
          label: v.post.categories[0].name,
          href: `/categories/${v.post.categories[0].slug}`,
        });
      }
      trail.push({ label: v.post.title });
    } else if (v.kind === "page" && v.page) {
      trail.push({ label: v.page.title });
    } else if (v.title) {
      trail.push({ label: v.title });
    }
    return (
      <nav className="cms-breadcrumbs" aria-label={t(locale, "breadcrumb.label")}>
        <ol>
          {trail.map((item, i) => (
            <li key={i}>
              {item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    );
  },

  Hero: ({ props, ctx }) => {
    const src = props.source;
    const words = src ? block(ctx, src, titleBlockSchema) : null;
    const eyebrow = words?.eyebrow || props.eyebrow;
    const description = words?.text || (props.showDescription ? ctx.site.description : "");
    const bind = (field: "eyebrow" | "title" | "text") =>
      src && words ? ce(ctx, cePath(src, field)) : {};
    return (
      <header className="cms-hero">
        {eyebrow ? (
          <p className="cms-hero__eyebrow" {...bind("eyebrow")}>
            {eyebrow}
          </p>
        ) : null}
        <Hn
          level={words?.headingLevel}
          fallback="h1"
          className="cms-hero__title"
          {...bind("title")}
        >
          {words?.title || ctx.site.title}
        </Hn>
        {description ? (
          <p className="cms-hero__description" {...bind("text")}>
            {description}
          </p>
        ) : null}
        {words?.image && src ? (
          <ContentImg
            ctx={ctx}
            image={words.image}
            path={cePath(src, "image")}
            className="cms-title__img"
            sizes="(max-width: 768px) 100vw, 960px"
          />
        ) : null}
        {words?.href && src ? (
          <Link
            className="cms-title__link"
            href={words.href}
            {...ce(ctx, cePath(src, "linkLabel"), "link", cePath(src, "href"))}
          >
            {words.linkLabel || (ctx.site.locale === "en" ? "Learn more" : "Xem thêm")}
          </Link>
        ) : null}
      </header>
    );
  },

  FeaturedPost: ({ props, ctx }) => {
    const post = ctx.view.featured;
    if (!post) return null;
    return (
      <PostItem
        post={post}
        variant="featured"
        showExcerpt={props.showExcerpt}
        locale={localeOf(ctx)}
      />
    );
  },

  PostList: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    const all = ctx.view.posts ?? [];
    const visible = all
      .filter((p) => !(props.skipFeatured && ctx.view.featured && p.id === ctx.view.featured.id))
      .slice(0, props.limit);
    if (visible.length === 0) return <p className="cms-empty">{t(locale, "post.noPosts")}</p>;
    return (
      <div className={`cms-post-list cms-post-list--${props.layout}`}>
        {visible.map((post) => (
          <PostItem
            key={post.id}
            post={post}
            variant={props.layout === "compact" ? "compact" : "card"}
            showExcerpt={props.showExcerpt}
            locale={locale}
          />
        ))}
      </div>
    );
  },

  PostDetail: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    const post = ctx.view.post;
    if (!post) return null;
    // Only when the table of contents is on, headings get ids to link to; otherwise the body is untouched.
    const { html, headings } = props.showToc
      ? withHeadingIds(post.bodyHtml)
      : { html: post.bodyHtml, headings: [] };
    return (
      <article className="cms-article" data-post-id={post.id}>
        <header className="cms-article__header">
          <h1 className="cms-article__title">{post.title}</h1>
          <p className="cms-article__meta">
            <time dateTime={post.publishedAt} className="cms-icon-text">
              <DuotoneIcon icon={faCalendar} className="cms-icon" gap />
              {formatDate(post.publishedAt, locale)}
            </time>
            <span className="cms-post__sep"> · </span>
            <Link
              href={`/authors/${post.author.slug}`}
              className="cms-icon-text cms-post__author"
              data-initial={post.author.name.charAt(0).toUpperCase()}
            >
              <DuotoneIcon icon={faUser} className="cms-icon" gap />
              {post.author.name}
            </Link>
            <span className="cms-post__read" hidden>
              {t(locale, "post.minRead", { minutes: post.readMinutes })}
            </span>
          </p>
          {post.categories.length > 0 ? (
            <ul className="cms-chips">
              {post.categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/categories/${c.slug}`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </header>
        {props.showFeaturedImage && post.featuredImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- themes render their own image markup
          <img
            className="cms-article__image"
            src={post.featuredImageUrl}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            {...responsiveImage(post.featuredImageUrl, "(max-width: 768px) 100vw, 800px")}
          />
        ) : null}
        <div className="cms-article__layout">
          {props.showToc || props.showShare ? (
            <aside className="cms-article__aside">
              {props.showToc && headings.length > 1 ? (
                <nav className="cms-toc" aria-label={t(locale, "post.toc")}>
                  <p className="cms-toc__title">{t(locale, "post.toc")}</p>
                  <ol>
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a href={`#${h.id}`}>{h.text}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
              {props.showShare ? (
                <div className="cms-share">
                  <p className="cms-share__title">{t(locale, "post.share")}</p>
                  <ul>
                    {shareLinks(post.canonicalUrl, post.title, locale).map((l) => (
                      <li key={l.label}>
                        <a
                          href={l.href}
                          target={l.external ? "_blank" : undefined}
                          rel="noopener noreferrer"
                        >
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          ) : null}
          <SafeHtml className="cms-article__body" html={html} />
        </div>
        {post.tags.length > 0 ? (
          <ul className="cms-chips cms-chips--tags">
            {post.tags.map((tag) => (
              <li key={tag.slug}>
                <Link href={`/tags/${tag.slug}`}>
                  {t(locale, "tag.prefix", { name: tag.name })}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {props.showAuthor ? (
          <aside className="cms-author">
            <span className="cms-author__avatar" aria-hidden="true">
              {post.author.name.charAt(0).toUpperCase()}
            </span>
            <div className="cms-author__text">
              <p className="cms-author__label">{t(locale, "post.author")}</p>
              <p className="cms-author__name">{post.author.name}</p>
            </div>
            <Link className="cms-author__more" href={`/authors/${post.author.slug}`}>
              {t(locale, "post.moreByAuthor")}
            </Link>
          </aside>
        ) : null}
        {props.showAdjacent && (ctx.view.adjacent?.previous || ctx.view.adjacent?.next) ? (
          <nav className="cms-adjacent" aria-label={t(locale, "post.adjacentLabel")}>
            {ctx.view.adjacent.previous ? (
              <Link
                className="cms-adjacent__link cms-adjacent__link--previous"
                href={ctx.view.adjacent.previous.url}
                rel="prev"
              >
                <span>{t(locale, "post.previous")}</span>
                <strong>{ctx.view.adjacent.previous.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {ctx.view.adjacent.next ? (
              <Link
                className="cms-adjacent__link cms-adjacent__link--next"
                href={ctx.view.adjacent.next.url}
                rel="next"
              >
                <span>{t(locale, "post.next")}</span>
                <strong>{ctx.view.adjacent.next.title}</strong>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </article>
    );
  },

  RelatedPosts: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    const related = (ctx.view.related ?? []).slice(0, props.limit);
    if (related.length === 0) return null;
    if (props.layout === "cards") {
      return (
        <aside className="cms-related cms-related--cards" aria-labelledby="cms-related-title">
          <header className="cms-related__head">
            <h2 id="cms-related-title" className="cms-related__title">
              {t(locale, "post.related")}
            </h2>
            <Link className="cms-related__all" href="/posts">
              {t(locale, "post.allPosts")}
            </Link>
          </header>
          <div className="cms-post-list cms-post-list--related">
            {related.map((post) => (
              <PostItem key={post.id} post={post} variant="related" locale={locale} />
            ))}
          </div>
        </aside>
      );
    }
    return (
      <aside className="cms-related" aria-labelledby="cms-related-title">
        <h2 id="cms-related-title" className="cms-related__title">
          {t(locale, "post.related")}
        </h2>
        <div className="cms-post-list cms-post-list--compact">
          {related.map((post) => (
            <PostItem key={post.id} post={post} variant="compact" locale={locale} />
          ))}
        </div>
      </aside>
    );
  },

  SectionTitle: ({ props, ctx }) => {
    // Words come from a "title..." block of content.json when `source` is set, so they can be translated.
    const fromContent = props.source ? block(ctx, props.source, titleBlockSchema) : null;
    const eyebrow = fromContent?.eyebrow || props.eyebrow;
    const title = fromContent?.title || props.title;
    const text = fromContent?.text || props.text;
    if (!title) return null;
    // Words that come from content.json can be edited in place; the block's own props cannot.
    const src = props.source;
    const bind = (field: "eyebrow" | "title" | "text", used: string | undefined) =>
      src && fromContent && used && used === fromContent[field] ? ce(ctx, cePath(src, field)) : {};
    return (
      <header className="cms-title">
        {eyebrow ? (
          <span className="cms-title__eyebrow" {...bind("eyebrow", eyebrow)}>
            {eyebrow}
          </span>
        ) : null}
        <Hn
          level={fromContent?.headingLevel}
          fallback="h2"
          className="cms-title__text"
          {...bind("title", title)}
        >
          {title}
        </Hn>
        {text ? (
          <p className="cms-title__sub" {...bind("text", text)}>
            {text}
          </p>
        ) : null}
        {fromContent?.image && src ? (
          <ContentImg
            ctx={ctx}
            image={fromContent.image}
            path={cePath(src, "image")}
            className="cms-title__img"
            sizes="(max-width: 768px) 100vw, 960px"
          />
        ) : null}
        {fromContent?.href && src ? (
          <Link
            className="cms-title__link"
            href={fromContent.href}
            {...ce(ctx, cePath(src, "linkLabel"), "link", cePath(src, "href"))}
          >
            {fromContent.linkLabel || (ctx.site.locale === "en" ? "Learn more" : "Xem thêm")}
          </Link>
        ) : null}
      </header>
    );
  },

  PageBody: ({ ctx }) => {
    const page = ctx.view.page;
    if (!page) return null;
    return (
      <article className="cms-page">
        <h1 className="cms-page__title">{page.title}</h1>
        <SafeHtml className="cms-page__body" html={page.bodyHtml} />
      </article>
    );
  },

  ArchiveHeader: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    // On the all-posts page a theme can word the heading itself, from a "title..." block.
    const words =
      props.source && ctx.view.archiveKind === "index"
        ? block(ctx, props.source, titleBlockSchema)
        : null;
    const description = words ? words.text : ctx.view.description;
    return (
      <header className="cms-archive-header">
        <Hn
          level={words?.headingLevel}
          fallback="h1"
          className="cms-archive-header__title"
          {...(words?.title && props.source ? ce(ctx, cePath(props.source, "title")) : {})}
        >
          {words?.title || (ctx.view.title ?? ctx.site.title)}
        </Hn>
        {description ? (
          <p
            className="cms-archive-header__description"
            {...(words && props.source ? ce(ctx, cePath(props.source, "text")) : {})}
          >
            {description}
          </p>
        ) : null}
        {props.showCount && ctx.view.total !== undefined ? (
          <p className="cms-archive-header__count">
            {t(locale, pluralKey("post.count", ctx.view.total), { count: ctx.view.total })}
          </p>
        ) : null}
      </header>
    );
  },

  Pagination: ({ ctx }) => {
    const locale = localeOf(ctx);
    const p = ctx.view.pagination;
    if (!p || p.totalPages <= 1) return null;
    const href = (page: number) => {
      const params = new URLSearchParams();
      if (p.query) params.set("q", p.query);
      if (page > 1) params.set("page", String(page));
      const qs = params.toString();
      return qs ? `${p.basePath}?${qs}` : p.basePath;
    };
    return (
      <nav className="cms-pagination" aria-label={t(locale, "pagination.label")}>
        {p.current > 1 ? (
          <Link href={href(p.current - 1)} rel="prev">
            <DuotoneIcon icon={faArrowLeft} className="cms-icon" /> {t(locale, "pagination.newer")}
          </Link>
        ) : (
          <span />
        )}
        <span className="cms-pagination__status">
          {t(locale, "pagination.status", { current: p.current, total: p.totalPages })}
        </span>
        {p.current < p.totalPages ? (
          <Link href={href(p.current + 1)} rel="next">
            {t(locale, "pagination.older")} <DuotoneIcon icon={faArrowRight} className="cms-icon" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    );
  },

  SearchForm: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    return (
      <form className="cms-search" action="/search" method="get" role="search">
        <label className="cms-search__label" htmlFor="cms-search-input">
          {t(locale, "search.label")}
        </label>
        <input
          id="cms-search-input"
          className="cms-search__input"
          type="search"
          name="q"
          defaultValue={ctx.view.query ?? ""}
          placeholder={
            (props.source ? block(ctx, props.source, titleBlockSchema)?.title : null) ||
            props.placeholder
          }
          maxLength={100}
        />
        <button className="cms-search__submit" type="submit">
          <DuotoneIcon icon={faMagnifyingGlass} className="cms-icon" /> {t(locale, "search.button")}
        </button>
      </form>
    );
  },

  EmptyState: ({ props, ctx }) => (
    <p
      className="cms-empty"
      {...(props.source && block(ctx, props.source, titleBlockSchema)?.title
        ? ce(ctx, cePath(props.source, "title"))
        : {})}
    >
      {(props.source ? block(ctx, props.source, titleBlockSchema)?.title : null) || props.message}
    </p>
  ),

  CategoryList: ({ props, ctx }) => {
    const items = (ctx.view.categories ?? []).slice(0, props.limit);
    if (items.length === 0) return null;
    return (
      <ul className="cms-chips">
        {items.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/categories/${c.slug}`}
              aria-current={
                ctx.view.archiveKind === "category" && ctx.view.title === c.name
                  ? "page"
                  : undefined
              }
            >
              {c.name} <span className="cms-chips__count">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  },

  TagList: ({ props, ctx }) => {
    const locale = localeOf(ctx);
    const items = (ctx.view.tags ?? []).slice(0, props.limit);
    if (items.length === 0) return null;
    return (
      <ul className="cms-chips cms-chips--tags">
        {items.map((tag) => (
          <li key={tag.slug}>
            <Link href={`/tags/${tag.slug}`}>{t(locale, "tag.prefix", { name: tag.name })}</Link>
          </li>
        ))}
      </ul>
    );
  },
};

/** The full map: core components plus the marketing blocks, which are kept in marketing.tsx. */
export const components: ComponentMap = {
  ...coreComponents,
  ...marketingComponents,
  ...builderComponents,
};

/** Mega menu: top-level links, and dropdown panels built from content.json "nav". */
function MegaHeader({ ctx }: { ctx: RenderContext }) {
  const locale = localeOf(ctx);
  const nav = entries(ctx, "nav", navItemSchema);
  const fromContent = !ctx.site.menu?.length;
  return (
    <header className="cms-header cms-header--mega">
      <Link className="cms-header__brand" href="/">
        {ctx.site.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo served by the CMS media route
          <img className="cms-header__logo" src={ctx.site.logoUrl} alt="" style={LOGO_STYLE(36)} />
        ) : null}
        {ctx.site.title}
      </Link>
      <MobileNav {...navLabels(locale)}>
        {ctx.site.menu?.length ? <CustomMenu items={ctx.site.menu} ctx={ctx} /> : null}
        {fromContent &&
          nav.map(({ item, index }) => {
            const at = cePath("nav", index);
            return item.children && item.children.length > 0 ? (
              <details key={item.label} className="cms-menu">
                <summary {...ce(ctx, cePath(at, "label"), "link", cePath(at, "href"))}>
                  {item.icon ? (
                    <DuotoneIcon icon={ICONS[item.icon]} className="cms-nav__icon" />
                  ) : null}
                  {item.label}
                </summary>
                <div className="cms-menu__panel">
                  {item.children.map((child, j) => {
                    const cat = cePath(at, "children", j);
                    const labelAndText = (
                      <>
                        <strong {...ce(ctx, cePath(cat, "label"), "link", cePath(cat, "href"))}>
                          {child.label}
                        </strong>
                        {child.text ? (
                          <span {...ce(ctx, cePath(cat, "text"))}>{child.text}</span>
                        ) : null}
                      </>
                    );
                    return (
                      <Link
                        key={child.label}
                        className="cms-menu__card"
                        href={child.href}
                        {...ce(ctx, cat, "group")}
                      >
                        {child.icon ? (
                          <span className="cms-menu__icon" aria-hidden="true">
                            <DuotoneIcon icon={ICONS[child.icon]} className="cms-icon" />
                          </span>
                        ) : null}
                        {/* The label and text sit directly in the card unless an icon is shown, so
                            themes that style the card's children (grid, spans) are not affected. */}
                        {child.icon ? (
                          <div className="cms-menu__body">{labelAndText}</div>
                        ) : (
                          labelAndText
                        )}
                      </Link>
                    );
                  })}
                </div>
              </details>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isCurrent(item.href, ctx) ? "page" : undefined}
                {...ce(ctx, cePath(at, "label"), "link", cePath(at, "href"))}
              >
                {item.icon ? (
                  <DuotoneIcon icon={ICONS[item.icon]} className="cms-nav__icon" />
                ) : null}
                {item.label}
              </Link>
            );
          })}
        <LanguageSwitch locale={locale} />
      </MobileNav>
    </header>
  );
}

/** Footer built from content.json "footer": link columns, contact line and copyright. */
function ContentFooter({
  ctx,
  footer,
}: {
  ctx: RenderContext;
  footer: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    contact: string;
    copyright: string;
  };
}) {
  return (
    <footer className="cms-footer cms-footer--columns cms-footer--content">
      <div className="cms-footer__columns">
        {footer.columns.map((column, i) => (
          <div key={column.title} className="cms-footer__column">
            <p className="cms-footer__title" {...ce(ctx, cePath("footer", "columns", i, "title"))}>
              {column.title}
            </p>
            <ul>
              {column.links.map((link, j) => {
                const at = cePath("footer", "columns", i, "links", j);
                return (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...ce(ctx, cePath(at, "label"), "link", cePath(at, "href"))}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer.contact ? (
        <p className="cms-footer__contact" {...ce(ctx, cePath("footer", "contact"))}>
          {footer.contact}
        </p>
      ) : null}
      <p className="cms-footer__copy" {...ce(ctx, cePath("footer", "copyright"))}>
        {footer.copyright || `© ${new Date().getUTCFullYear()} ${ctx.site.title}`}
      </p>
    </footer>
  );
}
