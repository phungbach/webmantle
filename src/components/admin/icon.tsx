import type { LucideIcon } from "lucide-react";

export type { LucideIcon };

// Admin icons come from Lucide: thin, rounded strokes that read well at 16px.
// The public theme components keep their own icon set (see components/icons).
export function Icon({
  icon: Glyph,
  className,
  title,
}: {
  icon: LucideIcon;
  className?: string;
  /** Accessible name. Without it the icon is decorative and hidden from screen readers. */
  title?: string;
}) {
  return title ? (
    <Glyph className={className} strokeWidth={1.75} role="img" aria-label={title} />
  ) : (
    <Glyph className={className} strokeWidth={1.75} aria-hidden="true" focusable="false" />
  );
}
