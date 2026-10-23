import type { RenderContext } from "@/components/theme/types";

export type CeKind = "text" | "image" | "link" | "group";

/** Dotted address of a value in the theme's content, e.g. courses.2.title. */
export const cePath = (...parts: (string | number)[]) => parts.join(".");

/**
 * Attributes that let the page designer find and edit a piece of the theme's content. Nothing is
 * emitted outside edit mode, or when the user may not edit theme content, so public output is
 * unchanged. A link names the path of its label and (data-ce-href) of its address.
 */
export function ce(
  ctx: RenderContext,
  path: string,
  kind: CeKind = "text",
  hrefPath?: string
): Record<string, string> {
  if (!ctx.edit || !ctx.contentEdit) return {};
  return {
    "data-ce": path,
    "data-ce-kind": kind,
    ...(hrefPath ? { "data-ce-href": hrefPath } : {}),
  };
}

/** Wraps loose text (next to an icon, say) in an editable span. Outside edit mode: the children, as is. */
export function Editable({
  ctx,
  path,
  children,
}: {
  ctx: RenderContext;
  path: string;
  children: React.ReactNode;
}) {
  if (!ctx.edit || !ctx.contentEdit) return <>{children}</>;
  return <span {...ce(ctx, path, "text")}>{children}</span>;
}
