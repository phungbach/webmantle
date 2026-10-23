import Link from "next/link";
import { responsiveImage } from "./responsive-image";
import { Editable, ce, cePath } from "./content-edit";
import { contentImageUrl } from "@/lib/themes/content-image";
import { withHeadingIds } from "@/lib/content/headings";
import type { z } from "zod";
import type { IconDefinition } from "@fortawesome/fontawesome-common-types";
import type { RenderContext } from "@/components/theme/types";
import type { ComponentMap } from "@/components/theme/components";
import {
  DuotoneIcon,
  faAward,
  faBookOpen,
  faBullseye,
  faCalendarDays,
  faChalkboardUser,
  faChartLine,
  faChild,
  faClock,
  faCoins,
  faGraduationCap,
  faHandshake,
  faHeart,
  faLaptop,
  faMessage,
  faMicrophone,
  faPlane,
  faPuzzlePiece,
  faShieldHalved,
  faPen,
  faArrowRight,
  faCheck,
  faGlobe,
  faStar,
  faUsers,
  faEnvelope,
  faLocationDot,
  faMagnifyingGlass,
  faPhone,
  faQuoteLeft,
  faBolt,
  faClockRotateLeft,
  faCloud,
  faCode,
  faCube,
  faDatabase,
  faEye,
  faFileLines,
  faFolderOpen,
  faGauge,
  faGear,
  faImage,
  faKey,
  faLanguage,
  faLayerGroup,
  faLink,
  faListCheck,
  faLock,
  faMobileScreen,
  faNewspaper,
  faPalette,
  faPlug,
  faRocket,
  faSitemap,
  faSliders,
  faTag,
  faUpload,
  faUserShield,
  faWandMagicSparkles,
} from "@/components/icons";
import {
  HEADING_LEVELS,
  ICON_KEYS,
  heroSchema,
  courseSchema,
  teacherSchema,
  planSchema,
  pricingHeadSchema,
  ctaSchema,
  docsNavSchema,
  extensionSchema,
  featureSchema,
  officeSchema,
  partnerSchema,
  searchSchema,
  statSchema,
  testimonialSchema,
} from "@/lib/themes/content-schemas";

/**
 * Marketing blocks: domain search, price tables, feature lists, stats, testimonials, partners,
 * offices and a call to action. Their words and numbers come from the theme's content.json, so a
 * theme changes the content without changing the layout code. Items that do not match the schema
 * are skipped, so one bad entry cannot break the page.
 */

/** Icon names used in content.json, mapped to glyphs. Only names in ICON_KEYS are accepted. */
export const ICONS: Record<(typeof ICON_KEYS)[number], IconDefinition> = {
  check: faCheck,
  star: faStar,
  users: faUsers,
  calendar: faCalendarDays,
  clock: faClock,
  book: faBookOpen,
  graduation: faGraduationCap,
  chart: faChartLine,
  target: faBullseye,
  mic: faMicrophone,
  chat: faMessage,
  laptop: faLaptop,
  plane: faPlane,
  child: faChild,
  award: faAward,
  shield: faShieldHalved,
  handshake: faHandshake,
  globe: faGlobe,
  chalkboard: faChalkboardUser,
  puzzle: faPuzzlePiece,
  coins: faCoins,
  heart: faHeart,
  pen: faPen,
  location: faLocationDot,
  bolt: faBolt,
  rocket: faRocket,
  code: faCode,
  lock: faLock,
  key: faKey,
  language: faLanguage,
  cloud: faCloud,
  mobile: faMobileScreen,
  layers: faLayerGroup,
  search: faMagnifyingGlass,
  image: faImage,
  palette: faPalette,
  gear: faGear,
  link: faLink,
  eye: faEye,
  tag: faTag,
  folder: faFolderOpen,
  wand: faWandMagicSparkles,
  cube: faCube,
  sitemap: faSitemap,
  database: faDatabase,
  gauge: faGauge,
  plug: faPlug,
  news: faNewspaper,
  upload: faUpload,
  list: faListCheck,
  history: faClockRotateLeft,
  file: faFileLines,
  sliders: faSliders,
  userShield: faUserShield,
};

// One card of CourseList: an item from content.json, or a post (its picture is already a full address).
type CourseItem = z.infer<typeof courseSchema> & { imageUrl?: string };

export const MARKETING_NAMES = [
  "DomainSearch",
  "ExtensionGrid",
  "PricingGrid",
  "FeatureList",
  "StatsStrip",
  "Testimonials",
  "LogoStrip",
  "OfficeList",
  "CtaBanner",
  "CourseList",
  "TeamGrid",
  "PromoHero",
  "DocsPage",
] as const;
export type MarketingName = (typeof MARKETING_NAMES)[number];

type Schema = z.ZodTypeAny;

export function block<T extends Schema>(
  ctx: RenderContext,
  key: string,
  schema: T
): z.infer<T> | null {
  const raw = ctx.content?.[key];
  if (raw === undefined) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data as z.infer<T>) : null;
}

/** Valid items of a content list, each with its index in the raw list (invalid items are skipped). */
export function entries<T extends Schema>(
  ctx: RenderContext,
  key: string,
  item: T,
  field?: string
): { item: z.infer<T>; index: number }[] {
  const root = ctx.content?.[key];
  const raw = field ? (root as Record<string, unknown> | undefined)?.[field] : root;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    const parsed = item.safeParse(entry);
    return parsed.success ? [{ item: parsed.data as z.infer<T>, index }] : [];
  });
}

export function list<T extends Schema>(
  ctx: RenderContext,
  key: string,
  item: T,
  field?: string
): z.infer<T>[] {
  return entries(ctx, key, item, field).map((e) => e.item);
}

type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** A title whose level an editor may change in the designer; `fallback` is the component's own level. */
export const Hn = ({
  level,
  fallback,
  ...rest
}: { level?: HeadingLevel; fallback: HeadingLevel } & React.HTMLAttributes<HTMLHeadingElement>) => {
  const Tag = level ?? fallback;
  return <Tag {...rest} />;
};

/** An optional picture of a content block (a theme asset or a media-library picture). */
export function ContentImg({
  ctx,
  image,
  path,
  className,
  sizes = "(max-width: 768px) 100vw, 400px",
}: {
  ctx: RenderContext;
  image: string | undefined;
  path: string;
  className: string;
  sizes?: string;
}) {
  if (!image) return null;
  const url = contentImageUrl(ctx.theme.id, ctx.theme.version, image);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- picture served by the theme or media route
    <img
      className={className}
      src={url}
      alt=""
      width={640}
      height={400}
      loading="lazy"
      decoding="async"
      {...responsiveImage(url, sizes)}
      {...ce(ctx, path, "image")}
    />
  );
}

const Section = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <section className={`cms-mkt ${className}`}>{children}</section>;

const Heading = ({
  ctx,
  source,
  title,
  text,
  level,
}: {
  ctx: RenderContext;
  source: string;
  title: string;
  text?: string;
  level?: HeadingLevel;
}) => (
  <header className="cms-mkt__heading">
    <Hn level={level} fallback="h2" {...ce(ctx, cePath(source, "title"))}>
      {title}
    </Hn>
    {text ? <p {...ce(ctx, cePath(source, "description"))}>{text}</p> : null}
  </header>
);

export const marketingComponents: Pick<ComponentMap, MarketingName> = {
  DomainSearch: ({ props, ctx }) => {
    const src = props.source;
    const s = block(ctx, src, searchSchema);
    if (!s) return null;
    return (
      <Section className="cms-mkt--search">
        <Hn
          level={s.headingLevel}
          fallback="h1"
          className="cms-mkt__hero-title"
          {...ce(ctx, cePath(src, "title"))}
        >
          {s.title}
        </Hn>
        {s.subtitle ? (
          <p className="cms-mkt__hero-sub" {...ce(ctx, cePath(src, "subtitle"))}>
            {s.subtitle}
          </p>
        ) : null}
        <form className="cms-mkt__search" action="/search" method="get" role="search">
          <label className="cms-search__label" htmlFor="cms-mkt-search">
            {s.placeholder || s.button}
          </label>
          <input
            id="cms-mkt-search"
            type="search"
            name="q"
            placeholder={s.placeholder}
            maxLength={100}
          />
          <button type="submit" {...ce(ctx, cePath(src, "button"), "link")}>
            <DuotoneIcon icon={faMagnifyingGlass} className="cms-icon" /> {s.button}
          </button>
        </form>
        {s.examples.length > 0 ? (
          <ul className="cms-mkt__chips">
            {s.examples.map((example, i) => (
              <li key={example}>
                <Link
                  href={`/search?q=${encodeURIComponent(example)}`}
                  {...ce(ctx, cePath(src, "examples", i))}
                >
                  {example}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    );
  },

  ExtensionGrid: ({ props, ctx }) => {
    const items = entries(ctx, props.source, extensionSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--extensions">
        <div className="cms-mkt__grid cms-mkt__grid--4">
          {items.map(({ item, index }) => {
            const at = cePath(props.source, index);
            return (
              <Link
                key={item.ext}
                href={item.href}
                className="cms-mkt__ext"
                {...ce(ctx, at, "group")}
              >
                <strong {...ce(ctx, cePath(at, "ext"))}>{item.ext}</strong>
                <span className="cms-mkt__price" {...ce(ctx, cePath(at, "price"))}>
                  {item.price}
                </span>
                {item.note ? (
                  <span className="cms-mkt__note" {...ce(ctx, cePath(at, "note"))}>
                    {item.note}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </Section>
    );
  },

  PricingGrid: ({ props, ctx }) => {
    const src = props.source;
    // The heading must be valid; each plan is checked on its own, so one bad plan is skipped.
    const head = block(ctx, src, pricingHeadSchema);
    if (!head) return null;
    const plans = entries(ctx, src, planSchema, "plans");
    if (plans.length === 0) return null;
    return (
      <Section className="cms-mkt--pricing">
        <Heading
          ctx={ctx}
          source={src}
          title={head.title}
          text={head.description}
          level={head.headingLevel}
        />
        <div className="cms-mkt__grid cms-mkt__grid--3">
          {plans.map(({ item: plan, index }) => {
            const at = cePath(src, "plans", index);
            return (
              <article key={plan.name} className="cms-mkt__plan" {...ce(ctx, at, "group")}>
                {plan.badge ? (
                  <span className="cms-mkt__badge" {...ce(ctx, cePath(at, "badge"))}>
                    {plan.badge}
                  </span>
                ) : null}
                <h3 {...ce(ctx, cePath(at, "name"))}>{plan.name}</h3>
                <p className="cms-mkt__amount">
                  <strong {...ce(ctx, cePath(at, "price"))}>{plan.price}</strong>
                  {plan.period ? (
                    <span {...ce(ctx, cePath(at, "period"))}> {plan.period}</span>
                  ) : null}
                </p>
                <ul className="cms-mkt__specs">
                  {plan.specs.map((spec, j) => (
                    <li key={spec}>
                      <DuotoneIcon icon={faCheck} className="cms-icon cms-mkt__check" />{" "}
                      <Editable ctx={ctx} path={cePath(at, "specs", j)}>
                        {spec}
                      </Editable>
                    </li>
                  ))}
                </ul>
                <Link
                  className="cms-mkt__button"
                  href={plan.href}
                  {...ce(ctx, cePath(at, "cta"), "link", cePath(at, "href"))}
                >
                  {plan.cta}
                </Link>
              </article>
            );
          })}
        </div>
      </Section>
    );
  },

  FeatureList: ({ props, ctx }) => {
    const items = entries(ctx, props.source, featureSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--features">
        <ul className="cms-mkt__checklist">
          {items.map(({ item, index }) => {
            const at = cePath(props.source, index);
            return (
              <li key={item.title} {...ce(ctx, at, "group")}>
                <span className="cms-mkt__icon" aria-hidden="true">
                  <DuotoneIcon icon={ICONS[item.icon ?? "check"]} className="cms-icon" />
                </span>
                <div>
                  <ContentImg
                    ctx={ctx}
                    image={item.image}
                    path={cePath(at, "image")}
                    className="cms-mkt__feature-img"
                  />
                  <strong {...ce(ctx, cePath(at, "title"))}>{item.title}</strong>
                  {item.text ? <p {...ce(ctx, cePath(at, "text"))}>{item.text}</p> : null}
                  {item.href ? (
                    <Link
                      className="cms-mkt__more"
                      href={item.href}
                      {...ce(ctx, cePath(at, "href"), "link", cePath(at, "href"))}
                    >
                      {ctx.site.locale === "en" ? "Learn more" : "Xem thêm"}{" "}
                      <DuotoneIcon icon={faArrowRight} className="cms-icon" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    );
  },

  StatsStrip: ({ props, ctx }) => {
    const items = entries(ctx, props.source, statSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--stats">
        <div className="cms-mkt__grid cms-mkt__grid--4">
          {items.map(({ item, index }) => {
            const at = cePath(props.source, index);
            return (
              <div key={item.label} className="cms-mkt__stat" {...ce(ctx, at, "group")}>
                {item.icon ? (
                  <span className="cms-mkt__icon" aria-hidden="true">
                    <DuotoneIcon icon={ICONS[item.icon]} className="cms-icon" />
                  </span>
                ) : null}
                <strong {...ce(ctx, cePath(at, "value"))}>{item.value}</strong>
                <span {...ce(ctx, cePath(at, "label"))}>{item.label}</span>
              </div>
            );
          })}
        </div>
      </Section>
    );
  },

  Testimonials: ({ props, ctx }) => {
    const items = entries(ctx, props.source, testimonialSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--testimonials">
        <div className="cms-mkt__grid cms-mkt__grid--2">
          {items.map(({ item, index }) => {
            const at = cePath(props.source, index);
            return (
              <figure
                key={item.name + item.quote}
                className="cms-mkt__quote"
                {...ce(ctx, at, "group")}
              >
                <DuotoneIcon icon={faQuoteLeft} className="cms-icon cms-mkt__quote-icon" />
                <blockquote {...ce(ctx, cePath(at, "quote"))}>{item.quote}</blockquote>
                <figcaption>
                  <strong {...ce(ctx, cePath(at, "name"))}>{item.name}</strong>
                  {item.role ? (
                    <span>
                      {" "}
                      ·{" "}
                      <Editable ctx={ctx} path={cePath(at, "role")}>
                        {item.role}
                      </Editable>
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </Section>
    );
  },

  LogoStrip: ({ props, ctx }) => {
    const items = entries(ctx, props.source, partnerSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--partners">
        <ul className="cms-mkt__logos">
          {items.map(({ item, index }) => (
            <li key={item.name} {...ce(ctx, cePath(props.source, index, "name"))}>
              {item.name}
            </li>
          ))}
        </ul>
      </Section>
    );
  },

  OfficeList: ({ props, ctx }) => {
    const items = entries(ctx, props.source, officeSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--offices">
        <div className="cms-mkt__grid cms-mkt__grid--3">
          {items.map(({ item: office, index }) => {
            const at = cePath(props.source, index);
            return (
              <div key={office.city} className="cms-mkt__office" {...ce(ctx, at, "group")}>
                <h3 {...ce(ctx, cePath(at, "city"))}>{office.city}</h3>
                <p>
                  <DuotoneIcon icon={faLocationDot} className="cms-icon" />{" "}
                  <Editable ctx={ctx} path={cePath(at, "address")}>
                    {office.address}
                  </Editable>
                </p>
                {office.phone ? (
                  <p>
                    <DuotoneIcon icon={faPhone} className="cms-icon" />{" "}
                    <Editable ctx={ctx} path={cePath(at, "phone")}>
                      {office.phone}
                    </Editable>
                  </p>
                ) : null}
                {office.email ? (
                  <p>
                    <DuotoneIcon icon={faEnvelope} className="cms-icon" />{" "}
                    <Editable ctx={ctx} path={cePath(at, "email")}>
                      {office.email}
                    </Editable>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>
    );
  },

  PromoHero: ({ props, ctx }) => {
    const src = props.source;
    const hero = block(ctx, src, heroSchema);
    if (!hero) return null;
    const imageUrl = hero.image
      ? contentImageUrl(ctx.theme.id, ctx.theme.version, hero.image)
      : null;
    return (
      <Section className="cms-mkt--promo">
        <div className={`cms-mkt__promo-grid${hero.image ? " cms-mkt__promo-grid--image" : ""}`}>
          <div className="cms-mkt__promo-body">
            {hero.eyebrow ? (
              <span className="cms-mkt__eyebrow" {...ce(ctx, cePath(src, "eyebrow"))}>
                {hero.eyebrow}
              </span>
            ) : null}
            <Hn
              level={hero.headingLevel}
              fallback="h1"
              className="cms-mkt__promo-title"
              {...ce(ctx, cePath(src, "title"))}
            >
              {hero.title}
            </Hn>
            {hero.text ? (
              <p className="cms-mkt__promo-text" {...ce(ctx, cePath(src, "text"))}>
                {hero.text}
              </p>
            ) : null}
            <div className="cms-mkt__actions">
              <Link
                className="cms-mkt__button"
                href={hero.primaryHref}
                {...ce(ctx, cePath(src, "primaryLabel"), "link", cePath(src, "primaryHref"))}
              >
                {hero.primaryLabel}
              </Link>
              {hero.secondaryLabel ? (
                <Link
                  className="cms-mkt__button cms-mkt__button--ghost"
                  href={hero.secondaryHref}
                  {...ce(ctx, cePath(src, "secondaryLabel"), "link", cePath(src, "secondaryHref"))}
                >
                  {hero.secondaryLabel}
                </Link>
              ) : null}
              {hero.tertiaryLabel ? (
                // A plain link, not next/link: a prefetch must never trigger the demo sign-in.
                <a
                  className="cms-mkt__button cms-mkt__button--demo"
                  href={hero.tertiaryHref}
                  rel="nofollow"
                  {...ce(ctx, cePath(src, "tertiaryLabel"), "link", cePath(src, "tertiaryHref"))}
                >
                  {hero.tertiaryLabel}
                </a>
              ) : null}
            </div>
            {hero.highlights.length > 0 ? (
              <ul className="cms-mkt__highlights">
                {hero.highlights.map((item, i) => (
                  <li key={item}>
                    <DuotoneIcon icon={faCheck} className="cms-icon cms-mkt__check" />{" "}
                    <Editable ctx={ctx} path={cePath(src, "highlights", i)}>
                      {item}
                    </Editable>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- illustration served by the theme route
            <img
              className="cms-mkt__promo-img"
              src={imageUrl}
              alt=""
              width={960}
              height={720}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              {...responsiveImage(imageUrl, "(max-width: 768px) 100vw, 560px")}
              {...ce(ctx, cePath(src, "image"), "image")}
            />
          ) : null}
        </div>
      </Section>
    );
  },

  CourseList: ({ props, ctx }) => {
    // With a `tag`, the cards are the posts that carry it. The theme's own items are the fallback.
    const posts = props.tag ? (ctx.view.tagPosts?.[props.tag] ?? []) : [];
    const fromPosts: (CourseItem & { index?: number })[] = posts.map((post) => {
      const { type, area, schedule, price } = post.fields;
      const hasFacts = Boolean(type || area || schedule || price);
      return {
        title: post.title,
        level: type ?? "",
        duration: area ?? "",
        schedule: schedule ?? "",
        price: price ?? "",
        text: hasFacts ? "" : post.excerpt,
        imageUrl: post.featuredImageUrl ?? undefined,
        href: post.url,
      };
    });
    const fromContent: (CourseItem & { index?: number })[] = entries(
      ctx,
      props.source,
      courseSchema
    ).map(({ item, index }) => ({ ...item, index }));
    const items = (fromPosts.length > 0 ? fromPosts : fromContent).slice(0, props.limit ?? 24);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--courses">
        <div className="cms-mkt__grid cms-mkt__grid--3">
          {items.map((course, i) => {
            // Only the theme's own items can be edited; cards made from posts are edited as posts.
            const at = course.index === undefined ? null : cePath(props.source, course.index);
            const bind = (field: string) => (at ? ce(ctx, cePath(at, field)) : {});
            const imageUrl =
              course.imageUrl ??
              (course.image
                ? contentImageUrl(ctx.theme.id, ctx.theme.version, course.image)
                : null);
            return (
              <article
                key={`${course.title}-${i}`}
                className="cms-mkt__course"
                {...(at ? ce(ctx, at, "group") : {})}
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- illustration served by the theme route
                  <img
                    className="cms-mkt__course-img"
                    src={imageUrl}
                    alt=""
                    width={960}
                    height={540}
                    loading="lazy"
                    decoding="async"
                    {...responsiveImage(imageUrl, "(max-width: 768px) 100vw, 400px")}
                    {...(at ? ce(ctx, cePath(at, "image"), "image") : {})}
                  />
                ) : null}
                <div className="cms-mkt__course-body">
                  {course.badge ? (
                    <span className="cms-mkt__badge" {...bind("badge")}>
                      {course.badge}
                    </span>
                  ) : null}
                  {course.level ? (
                    <span className="cms-mkt__level" {...bind("level")}>
                      {course.level}
                    </span>
                  ) : null}
                  <h3 {...bind("title")}>{course.title}</h3>
                  {course.text ? <p {...bind("text")}>{course.text}</p> : null}
                  <ul className="cms-mkt__facts">
                    {course.duration ? (
                      <li>
                        <DuotoneIcon icon={faClock} className="cms-icon" />{" "}
                        <span {...bind("duration")}>{course.duration}</span>
                      </li>
                    ) : null}
                    {course.schedule ? (
                      <li>
                        <DuotoneIcon icon={faCalendarDays} className="cms-icon" />{" "}
                        <span {...bind("schedule")}>{course.schedule}</span>
                      </li>
                    ) : null}
                  </ul>
                  <div className="cms-mkt__course-foot">
                    {course.price ? <strong {...bind("price")}>{course.price}</strong> : <span />}
                    <Link href={course.href}>
                      {ctx.site.locale === "en" ? "View details" : "Xem chi tiết"}{" "}
                      <DuotoneIcon icon={faArrowRight} className="cms-icon" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Section>
    );
  },

  TeamGrid: ({ props, ctx }) => {
    const items = entries(ctx, props.source, teacherSchema);
    if (items.length === 0) return null;
    return (
      <Section className="cms-mkt--team">
        <div className="cms-mkt__grid cms-mkt__grid--3">
          {items.map(({ item: teacher, index }) => {
            const at = cePath(props.source, index);
            return (
              <div key={teacher.name} className="cms-mkt__teacher" {...ce(ctx, at, "group")}>
                {teacher.image ? (
                  <ContentImg
                    ctx={ctx}
                    image={teacher.image}
                    path={cePath(at, "image")}
                    className="cms-mkt__avatar cms-mkt__avatar--img"
                    sizes="96px"
                  />
                ) : (
                  <span className="cms-mkt__avatar" aria-hidden="true">
                    {teacher.name.charAt(0)}
                  </span>
                )}
                <h3 {...ce(ctx, cePath(at, "name"))}>{teacher.name}</h3>
                {teacher.role ? (
                  <p className="cms-mkt__role" {...ce(ctx, cePath(at, "role"))}>
                    {teacher.role}
                  </p>
                ) : null}
                {teacher.experience ? (
                  <p className="cms-mkt__note" {...ce(ctx, cePath(at, "experience"))}>
                    {teacher.experience}
                  </p>
                ) : null}
                {teacher.bio ? <p {...ce(ctx, cePath(at, "bio"))}>{teacher.bio}</p> : null}
              </div>
            );
          })}
        </div>
      </Section>
    );
  },

  CtaBanner: ({ props, ctx }) => {
    const src = props.source;
    const cta = block(ctx, src, ctaSchema);
    if (!cta) return null;
    return (
      <Section className="cms-mkt--cta">
        <ContentImg
          ctx={ctx}
          image={cta.image}
          path={cePath(src, "image")}
          className="cms-mkt__cta-img"
        />
        <div>
          <Hn level={cta.headingLevel} fallback="h2" {...ce(ctx, cePath(src, "title"))}>
            {cta.title}
          </Hn>
          {cta.text ? <p {...ce(ctx, cePath(src, "text"))}>{cta.text}</p> : null}
        </div>
        <Link
          className="cms-mkt__button"
          href={cta.href}
          {...ce(ctx, cePath(src, "button"), "link", cePath(src, "href"))}
        >
          {cta.button} <DuotoneIcon icon={faArrowRight} className="cms-icon" />
        </Link>
      </Section>
    );
  },

  DocsPage: ({ props, ctx }) => {
    const page = ctx.view.page;
    if (!page) return null;
    const en = ctx.site.locale === "en";
    const src = props.source;
    const nav = block(ctx, src, docsNavSchema);
    const { html, headings } = withHeadingIds(page.bodyHtml);
    const current = `/pages/${page.slug}`;
    const flat = (nav?.groups ?? []).flatMap((group) =>
      group.links.map((link) => ({ group, link }))
    );
    const at = flat.findIndex((entry) => entry.link.href === current);
    const prev = at > 0 ? flat[at - 1]!.link : null;
    const next = at >= 0 && at < flat.length - 1 ? flat[at + 1]!.link : null;
    const section = at >= 0 ? flat[at]!.group.title : "";
    return (
      <div className="cms-docs">
        {nav ? (
          <nav
            className="cms-docs__nav"
            aria-label={nav.title || (en ? "Documentation" : "Tài liệu")}
          >
            <details className="cms-docs__menu" open>
              <summary>{nav.title || (en ? "Documentation" : "Tài liệu")}</summary>
              {nav.groups.map((group, gi) => (
                <div key={group.title + gi} className="cms-docs__group">
                  <p
                    className="cms-docs__group-title"
                    {...ce(ctx, cePath(src, "groups", gi, "title"))}
                  >
                    {group.title}
                  </p>
                  <ul>
                    {group.links.map((link, li) => (
                      <li key={link.href + li}>
                        <Link
                          href={link.href}
                          aria-current={link.href === current ? "page" : undefined}
                          {...ce(
                            ctx,
                            cePath(src, "groups", gi, "links", li, "label"),
                            "link",
                            cePath(src, "groups", gi, "links", li, "href")
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          </nav>
        ) : null}
        <article className="cms-docs__main">
          {section ? <p className="cms-docs__eyebrow">{section}</p> : null}
          <h1 className="cms-docs__title">{page.title}</h1>
          <div
            className="cms-page__body cms-docs__body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {prev || next ? (
            <nav
              className="cms-docs__pager"
              aria-label={en ? "Previous and next" : "Trang trước và sau"}
            >
              {prev ? (
                <Link href={prev.href} rel="prev" className="cms-docs__pager-prev">
                  <span>{en ? "Previous" : "Trước"}</span>
                  {prev.label}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={next.href} rel="next" className="cms-docs__pager-next">
                  <span>{en ? "Next" : "Tiếp theo"}</span>
                  {next.label}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </article>
        {headings.length > 1 ? (
          <aside className="cms-docs__toc" aria-label={en ? "On this page" : "Trên trang này"}>
            <p>{en ? "On this page" : "Trên trang này"}</p>
            <ul>
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a href={`#${heading.id}`}>{heading.text}</a>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    );
  },
};
