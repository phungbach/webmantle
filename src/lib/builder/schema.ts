import { z } from "zod";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { sanitizeRichText } from "@/lib/security/sanitize";
import { COMPONENT_PROPS } from "@/lib/themes/contract";
import { BUILDER_TYPES, isContainer, type BuilderBlockType } from "@/lib/builder/blocks";

export const LAYOUT_LIMITS = { depth: 5, nodes: 300, bytes: 200 * 1024 } as const;

export type BlockNode = {
  id: string;
  type: BuilderBlockType;
  props: Record<string, unknown>;
  children?: BlockNode[];
};
export type LayoutDoc = { version: 1; blocks: BlockNode[] };

const blockSchema: z.ZodType<BlockNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      id: z.string().regex(/^[a-z0-9]{6,24}$/, "Invalid block id"),
      type: z.enum(BUILDER_TYPES),
      props: z.record(z.string(), z.unknown()),
      children: z.array(blockSchema).optional(),
    })
    .strict()
) as z.ZodType<BlockNode, z.ZodTypeDef, unknown>;

/**
 * Checks the tree rules, validates each block's props with the same schemas the renderer uses
 * (defaults applied, unknown keys rejected) and sanitizes rich text. The result is normalized.
 */
export const layoutDocSchema = z
  .object({ version: z.literal(1), blocks: z.array(blockSchema).max(LAYOUT_LIMITS.nodes) })
  .strict()
  .transform((doc, ctx): LayoutDoc => {
    const seen = new Set<string>();
    let count = 0;
    let failed = false;
    const fail = (message: string, path: (string | number)[]) => {
      failed = true;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
    };

    const walk = (
      nodes: BlockNode[],
      depth: number,
      parent: BlockNode | null,
      path: (string | number)[]
    ): BlockNode[] =>
      nodes.map((node, i) => {
        const at = [...path, i];
        count += 1;
        if (depth > LAYOUT_LIMITS.depth) fail("Nested too deeply", at);
        if (seen.has(node.id)) fail("Duplicate block id", [...at, "id"]);
        seen.add(node.id);
        if (node.type === "Section" && parent) fail("A section cannot be nested", at);
        if (node.children?.length && !isContainer(node.type))
          fail(`${node.type} cannot contain other blocks`, [...at, "children"]);

        const parsed = COMPONENT_PROPS[node.type].safeParse(node.props);
        let props: Record<string, unknown> = node.props;
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          fail(`${node.type}: ${issue?.path.join(".") || "props"} ${issue?.message ?? "invalid"}`, [
            ...at,
            "props",
            ...(issue?.path ?? []),
          ]);
        } else {
          props = parsed.data as Record<string, unknown>;
          if (node.type === "RichText" && typeof props.html === "string")
            props = { ...props, html: sanitizeRichText(props.html) };
        }
        const children = node.children?.length
          ? walk(node.children, depth + 1, node, [...at, "children"])
          : undefined;
        return { id: node.id, type: node.type, props, ...(children ? { children } : {}) };
      });

    const blocks = walk(doc.blocks, 1, null, ["blocks"]);
    if (count > LAYOUT_LIMITS.nodes) fail("Too many blocks", ["blocks"]);
    if (failed) return z.NEVER;
    return { version: 1, blocks };
  });

/**
 * Returns a copy of the document with every RichText `html` passed through sanitizeRichText.
 * Pure and idempotent; used when saving, when reading stored JSON and when composing a layout,
 * so unsafe markup never reaches a component even if it was stored some other way.
 */
export function sanitizeLayoutDoc(doc: LayoutDoc): LayoutDoc {
  const clean = (node: BlockNode): BlockNode => ({
    ...node,
    props:
      node.type === "RichText"
        ? { ...node.props, html: sanitizeRichText(String(node.props.html ?? "")) }
        : node.props,
    ...(node.children ? { children: node.children.map(clean) } : {}),
  });
  return { version: 1, blocks: doc.blocks.map(clean) };
}

/** Parses stored JSON. Returns null for "", bad JSON or a document that is not valid. Never throws. */
export function parseLayout(json: string): LayoutDoc | null {
  try {
    if (!json || json.length > LAYOUT_LIMITS.bytes) return null;
    const parsed = layoutDocSchema.safeParse(JSON.parse(json));
    return parsed.success ? sanitizeLayoutDoc(parsed.data) : null;
  } catch {
    return null;
  }
}

/** Validates user input (an object or a JSON string); throws a ValidationError with a safe message. */
export function validateLayoutInput(input: unknown): LayoutDoc {
  let value = input;
  if (typeof input === "string") {
    if (input.length > LAYOUT_LIMITS.bytes) throw new ValidationError("The layout is too large.");
    try {
      value = JSON.parse(input);
    } catch {
      throw new ValidationError("The layout is not valid JSON.");
    }
  }
  const parsed = layoutDocSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(
      `Layout: ${issue?.path.join(".") || "document"}: ${issue?.message ?? "invalid"}`
    );
  }
  if (JSON.stringify(parsed.data).length > LAYOUT_LIMITS.bytes)
    throw new ValidationError("The layout is too large.");
  return sanitizeLayoutDoc(parsed.data);
}

/** Media ids used by the blocks of a document. */
export function collectMediaIds(doc: LayoutDoc): string[] {
  const ids = new Set<string>();
  const visit = (nodes: BlockNode[]) => {
    for (const node of nodes) {
      const p = node.props;
      if (typeof p.mediaId === "string") ids.add(p.mediaId);
      for (const key of ["images", "items"] as const) {
        const list = p[key];
        if (Array.isArray(list))
          for (const item of list) {
            const id = (item as { mediaId?: unknown } | null)?.mediaId;
            if (typeof id === "string") ids.add(id);
          }
      }
      if (node.children) visit(node.children);
    }
  };
  visit(doc.blocks);
  return [...ids];
}

/** Every image used in the document must exist in the media library. */
export async function assertMediaExists(doc: LayoutDoc): Promise<void> {
  const ids = collectMediaIds(doc);
  if (ids.length === 0) return;
  const count = await prisma.media.count({ where: { id: { in: ids } } });
  if (count !== ids.length)
    throw new ValidationError("An image used in the layout no longer exists.");
}

/**
 * Drops references to images that no longer exist, so a deleted picture renders nothing instead of
 * a broken image: an Image/Banner loses its mediaId, Gallery and card items lose that image.
 */
export async function pruneMissingMedia(doc: LayoutDoc): Promise<LayoutDoc> {
  const ids = collectMediaIds(doc);
  if (ids.length === 0) return doc;
  const found = await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const existing = new Set(found.map((m) => m.id));
  if (existing.size === ids.length) return doc;
  const ok = (v: unknown) => typeof v !== "string" || existing.has(v);
  const clean = (node: BlockNode): BlockNode => {
    const props = { ...node.props };
    if (!ok(props.mediaId)) delete props.mediaId;
    if (Array.isArray(props.images))
      props.images = props.images.filter((i) => ok((i as { mediaId?: unknown }).mediaId));
    if (Array.isArray(props.items))
      props.items = props.items.map((item) => {
        const copy = { ...(item as Record<string, unknown>) };
        if (!ok(copy.mediaId)) delete copy.mediaId;
        return copy;
      });
    return { ...node, props, ...(node.children ? { children: node.children.map(clean) } : {}) };
  };
  return { version: 1, blocks: doc.blocks.map(clean) };
}
