import type { BuilderBlockType } from "@/lib/builder/blocks";

// Same shapes as src/lib/builder/schema.ts, redeclared here because that file talks to the database
// and must not be imported by client code.
export type BlockNode = {
  id: string;
  type: BuilderBlockType;
  props: Record<string, unknown>;
  children?: BlockNode[];
};
export type LayoutDoc = { version: 1; blocks: BlockNode[] };

export const LIMITS = { depth: 5, nodes: 300 } as const;

export type Target = { kind: "page"; id: string } | { kind: "home" };

/** Translator over the builder.* messages passed from the server. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type MediaItem = { id: string; alt: string; name: string };

export const emptyDoc = (): LayoutDoc => ({ version: 1, blocks: [] });
