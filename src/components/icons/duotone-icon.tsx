import type { IconDefinition } from "@fortawesome/fontawesome-common-types";

/**
 * Two-tone icon built from a Font Awesome glyph. The free icon set has one shape per glyph (no
 * duotone version), so the second tone is a faded copy offset behind the shape. Colour follows
 * currentColor, and all styling is inline, so it renders the same inside any theme.
 */
export function DuotoneIcon({
  icon,
  className,
  title,
  gap = false,
}: {
  icon: IconDefinition;
  className?: string;
  title?: string;
  /** Adds space after the icon when it sits directly before text. */
  gap?: boolean;
}) {
  const [width, height, , , data] = icon.icon;
  const paths = Array.isArray(data) ? data : [data];
  // Multi-path glyphs already have two layers: the first is the secondary tone.
  const secondary = paths[0];
  const primary = paths.length > 1 ? paths[1] : paths[0];
  const offset =
    paths.length > 1 ? null : `translate(${width * 0.12} ${height * 0.12}) scale(0.88)`;
  const labelled = Boolean(title);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      width="1em"
      height="1em"
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      style={{
        display: "inline-block",
        verticalAlign: "-0.125em",
        overflow: "visible",
        marginInlineEnd: gap ? "0.3em" : undefined,
      }}
    >
      {labelled ? <title>{title}</title> : null}
      <path d={secondary} fill="currentColor" fillOpacity={0.35} transform={offset ?? undefined} />
      <path d={primary} fill="currentColor" />
    </svg>
  );
}
