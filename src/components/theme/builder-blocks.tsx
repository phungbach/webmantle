import Link from "next/link";
import type { z } from "zod";
import { COMPONENT_PROPS } from "@/lib/themes/contract";
import type { ComponentMap } from "@/components/theme/components";
import { SafeHtml } from "@/components/theme/components";
import { DuotoneIcon } from "@/components/icons";
import { ICONS } from "@/components/theme/marketing";
import { responsiveImage } from "@/components/theme/responsive-image";

/**
 * Blocks of the page designer. Their content lives in their props, validated by COMPONENT_PROPS.
 * Styling is in BUILDER_CSS (theme-frame.tsx) under the .cms-b- prefix; themes may override it.
 */
export const BUILDER_NAMES = [
  "Heading",
  "RichText",
  "Image",
  "Button",
  "Spacer",
  "Divider",
  "Gallery",
  "BannerHero",
  "CardsGrid",
  "CtaBlock",
] as const;
export type BuilderName = (typeof BUILDER_NAMES)[number];

type P<N extends BuilderName> = z.infer<(typeof COMPONENT_PROPS)[N]>;

const mediaUrl = (id: string) => `/media/${encodeURIComponent(id)}`;

const isExternal = (href: string) => /^(https?:|mailto:|tel:|\/\/)/i.test(href);

/** Internal paths use next/link; everything else is a plain link that opens safely. */
function SmartLink({
  href,
  className,
  newTab,
  children,
}: {
  href: string;
  className?: string;
  newTab?: boolean;
  children: React.ReactNode;
}) {
  if (!isExternal(href) && !newTab) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      {...(newTab || /^https?:/i.test(href)
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  );
}

function Picture({
  mediaId,
  alt,
  sizes,
  className,
}: {
  mediaId: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const base = mediaUrl(mediaId);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by the CMS media route
    <img
      className={className}
      src={`${base}?w=1024`}
      alt={alt}
      loading="lazy"
      decoding="async"
      {...responsiveImage(base, sizes)}
    />
  );
}

const ALIGN = (a: string) => `cms-b--align-${a}`;

export const builderComponents: Pick<ComponentMap, BuilderName> = {
  Heading: ({ props }: { props: P<"Heading"> }) => {
    const Tag = `h${props.level}` as "h1" | "h2" | "h3" | "h4";
    return (
      <Tag className={`cms-b-heading cms-b-heading--${props.level} ${ALIGN(props.align)}`}>
        {props.text}
      </Tag>
    );
  },

  RichText: ({ props }) =>
    props.html ? (
      <SafeHtml html={props.html} className={`cms-b-richtext ${ALIGN(props.align)}`} />
    ) : null,

  Image: ({ props }) => {
    if (!props.mediaId) return null;
    const sizes =
      props.width === "content"
        ? "(max-width: 768px) 100vw, 720px"
        : props.width === "wide"
          ? "(max-width: 768px) 100vw, 1100px"
          : "100vw";
    const picture = (
      <Picture mediaId={props.mediaId} alt={props.alt} sizes={sizes} className="cms-b-image__img" />
    );
    return (
      <figure
        className={`cms-b-image cms-b-image--${props.width}${props.rounded ? " cms-b-image--rounded" : ""}`}
      >
        {props.href ? <SmartLink href={props.href}>{picture}</SmartLink> : picture}
        {props.caption ? (
          <figcaption className="cms-b-image__caption">{props.caption}</figcaption>
        ) : null}
      </figure>
    );
  },

  Button: ({ props }) => (
    <div className={`cms-b-button-wrap ${ALIGN(props.align)}`}>
      <SmartLink
        href={props.href}
        newTab={props.newTab}
        className={`cms-b-button cms-b-button--${props.variant}`}
      >
        {props.label}
      </SmartLink>
    </div>
  ),

  Spacer: ({ props }) => (
    <div className={`cms-b-spacer cms-b-spacer--${props.size}`} aria-hidden="true" />
  ),

  Divider: () => <hr className="cms-b-divider" />,

  Gallery: ({ props }) =>
    props.images.length === 0 ? null : (
      <ul className={`cms-b-gallery cms-b-gallery--${props.columns}`}>
        {props.images.map((image, index) => (
          <li key={`${image.mediaId}-${index}`} className="cms-b-gallery__item">
            <Picture
              mediaId={image.mediaId}
              alt={image.alt}
              sizes={`(max-width: 640px) 100vw, ${Math.round(1100 / props.columns)}px`}
              className="cms-b-gallery__img"
            />
          </li>
        ))}
      </ul>
    ),

  BannerHero: ({ props }) => (
    <section
      className={`cms-b-banner cms-b-banner--${props.tone} ${ALIGN(props.align)}${props.mediaId ? " cms-b-banner--has-image" : ""}`}
    >
      {props.mediaId ? (
        <Picture mediaId={props.mediaId} alt="" sizes="100vw" className="cms-b-banner__bg" />
      ) : null}
      <div className="cms-b-banner__inner">
        {props.eyebrow ? <p className="cms-b-banner__eyebrow">{props.eyebrow}</p> : null}
        <h2 className="cms-b-banner__title">{props.title}</h2>
        {props.text ? <p className="cms-b-banner__text">{props.text}</p> : null}
        {props.buttonLabel && props.buttonHref ? (
          <SmartLink href={props.buttonHref} className="cms-b-button cms-b-button--primary">
            {props.buttonLabel}
          </SmartLink>
        ) : null}
      </div>
    </section>
  ),

  CardsGrid: ({ props }) => (
    <ul className={`cms-b-cards cms-b-cards--${props.columns}`}>
      {props.items.map((item, index) => {
        const body = (
          <>
            {item.mediaId ? (
              <Picture
                mediaId={item.mediaId}
                alt=""
                sizes={`(max-width: 640px) 100vw, ${Math.round(1100 / props.columns)}px`}
                className="cms-b-cards__img"
              />
            ) : null}
            {item.icon ? (
              <span className="cms-b-cards__icon" aria-hidden="true">
                <DuotoneIcon icon={ICONS[item.icon]} className="cms-icon" />
              </span>
            ) : null}
            <h3 className="cms-b-cards__title">{item.title}</h3>
            {item.text ? <p className="cms-b-cards__text">{item.text}</p> : null}
          </>
        );
        return (
          <li key={`${item.title}-${index}`} className="cms-b-cards__item">
            {item.href ? (
              <SmartLink href={item.href} className="cms-b-cards__link">
                {body}
              </SmartLink>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  ),

  CtaBlock: ({ props }) => (
    <section className={`cms-b-cta cms-b-cta--${props.tone}`}>
      <div className="cms-b-cta__inner">
        <h2 className="cms-b-cta__title">{props.title}</h2>
        {props.text ? <p className="cms-b-cta__text">{props.text}</p> : null}
        <SmartLink href={props.buttonHref} className="cms-b-button cms-b-button--primary">
          {props.buttonLabel}
        </SmartLink>
      </div>
    </section>
  ),
};
