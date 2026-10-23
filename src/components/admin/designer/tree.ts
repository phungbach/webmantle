import { BLOCK_DEFS, isContainer, type BuilderBlockType } from "@/lib/builder/blocks";
import { LIMITS, type BlockNode, type LayoutDoc } from "./types";

/** Random block id matching ^[a-z0-9]{6,24}$. */
export function newId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function newBlock(type: BuilderBlockType): BlockNode {
  const def = BLOCK_DEFS[type];
  return {
    id: newId(),
    type,
    props: structuredClone(def.defaults),
    ...(def.container ? { children: [] } : {}),
  };
}

export type Location = { parentId: string | null; index: number };

export function find(doc: LayoutDoc, id: string): { node: BlockNode; loc: Location } | null {
  const walk = (nodes: BlockNode[], parentId: string | null): ReturnType<typeof find> => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.id === id) return { node, loc: { parentId, index: i } };
      const inner = node.children ? walk(node.children, node.id) : null;
      if (inner) return inner;
    }
    return null;
  };
  return walk(doc.blocks, null);
}

/** Position of the top-level block that contains (or is) the given block. */
export function topLevel(doc: LayoutDoc, id: string): Location {
  let loc = find(doc, id)?.loc ?? { parentId: null, index: doc.blocks.length };
  while (loc.parentId) {
    const parent = find(doc, loc.parentId);
    if (!parent) break;
    loc = parent.loc;
  }
  return loc;
}

export const countNodes = (nodes: BlockNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + (n.children ? countNodes(n.children) : 0), 0);

/** Height of a subtree: a leaf is 1. */
const height = (node: BlockNode): number => 1 + Math.max(0, ...(node.children ?? []).map(height));

function depthOf(doc: LayoutDoc, parentId: string | null): number {
  if (!parentId) return 0;
  let depth = 0;
  const walk = (nodes: BlockNode[], d: number): boolean => {
    for (const n of nodes) {
      if (n.id === parentId) {
        depth = d;
        return true;
      }
      if (n.children && walk(n.children, d + 1)) return true;
    }
    return false;
  };
  walk(doc.blocks, 1);
  return depth;
}

export type Placement = {
  valid: boolean;
  reason?: "section" | "container" | "depth" | "count" | "self";
};

/**
 * Whether `node` (an existing block, or a new one) may be placed inside `parentId` (null = top level).
 * Mirrors the rules in src/lib/builder/schema.ts, so the UI can never build an invalid document.
 */
export function canPlace(doc: LayoutDoc, node: BlockNode, parentId: string | null): Placement {
  if (parentId) {
    const parentFound = find(doc, parentId);
    if (!parentFound) return { valid: false, reason: "container" };
    if (node.type === "Section") return { valid: false, reason: "section" };
    if (!isContainer(parentFound.node.type)) return { valid: false, reason: "container" };
    // A block cannot move into itself or one of its own descendants.
    if (parentId === node.id || find({ version: 1, blocks: [node] }, parentId))
      return { valid: false, reason: "self" };
  }
  if (depthOf(doc, parentId) + height(node) > LIMITS.depth)
    return { valid: false, reason: "depth" };
  const existing = find(doc, node.id);
  const total = countNodes(doc.blocks) - (existing ? countNodes([existing.node]) : 0);
  if (total + countNodes([node]) > LIMITS.nodes) return { valid: false, reason: "count" };
  return { valid: true };
}

const mapTree = (nodes: BlockNode[], fn: (n: BlockNode) => BlockNode | null): BlockNode[] =>
  nodes.flatMap((n) => {
    const next = fn(n);
    if (!next) return [];
    return [next.children ? { ...next, children: mapTree(next.children, fn) } : next];
  });

export function removeNode(doc: LayoutDoc, id: string): LayoutDoc {
  return { ...doc, blocks: mapTree(doc.blocks, (n) => (n.id === id ? null : n)) };
}

export function insertNode(
  doc: LayoutDoc,
  node: BlockNode,
  parentId: string | null,
  index: number
): LayoutDoc {
  if (!parentId) {
    const blocks = [...doc.blocks];
    blocks.splice(Math.min(index, blocks.length), 0, node);
    return { ...doc, blocks };
  }
  const walk = (nodes: BlockNode[]): BlockNode[] =>
    nodes.map((n) => {
      if (n.id === parentId) {
        const children = [...(n.children ?? [])];
        children.splice(Math.min(index, children.length), 0, node);
        return { ...n, children };
      }
      return n.children ? { ...n, children: walk(n.children) } : n;
    });
  return { ...doc, blocks: walk(doc.blocks) };
}

/** Moves a block; the index refers to the list after the block has been taken out. */
export function moveNode(
  doc: LayoutDoc,
  id: string,
  parentId: string | null,
  index: number
): LayoutDoc {
  const found = find(doc, id);
  if (!found) return doc;
  return insertNode(removeNode(doc, id), found.node, parentId, index);
}

export function updateProps(doc: LayoutDoc, id: string, props: Record<string, unknown>): LayoutDoc {
  return { ...doc, blocks: mapTree(doc.blocks, (n) => (n.id === id ? { ...n, props } : n)) };
}

/** Deep copy with fresh ids. */
export function cloneWithNewIds(node: BlockNode): BlockNode {
  return {
    ...node,
    id: newId(),
    props: structuredClone(node.props),
    ...(node.children ? { children: node.children.map(cloneWithNewIds) } : {}),
  };
}

export type FlatRow = {
  node: BlockNode;
  depth: number;
  parentId: string | null;
  index: number;
  siblings: number;
};

export function flatten(doc: LayoutDoc): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (nodes: BlockNode[], depth: number, parentId: string | null) =>
    nodes.forEach((node, index) => {
      out.push({ node, depth, parentId, index, siblings: nodes.length });
      if (node.children) walk(node.children, depth + 1, node.id);
    });
  walk(doc.blocks, 0, null);
  return out;
}

/** Short text shown next to a block in the structure tree. */
export function summary(node: BlockNode): string {
  const p = node.props;
  const first = ["title", "text", "label", "buttonLabel", "placeholder"].find(
    (k) => typeof p[k] === "string" && p[k]
  );
  if (first) return String(p[first]);
  if (typeof p.html === "string")
    return p.html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (Array.isArray(p.items) && p.items[0])
    return String((p.items[0] as { title?: string }).title ?? "");
  if (typeof p.alt === "string" && p.alt) return p.alt;
  return "";
}
