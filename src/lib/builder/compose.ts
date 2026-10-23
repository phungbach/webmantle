import type { ThemeBundle } from "@/lib/themes/registry";
import { templateFor } from "@/lib/themes/registry";
import type { LayoutNode } from "@/lib/themes/contract";
import { sanitizeLayoutDoc, type BlockNode, type LayoutDoc } from "@/lib/builder/schema";

function findFirst(node: LayoutNode, component: string): LayoutNode | null {
  if (node.component === component) return node;
  for (const child of node.children ?? []) {
    const found = findFirst(child, component);
    if (found) return found;
  }
  return null;
}

function findLast(node: LayoutNode, component: string): LayoutNode | null {
  for (const child of [...(node.children ?? [])].reverse()) {
    const found = findLast(child, component);
    if (found) return found;
  }
  return node.component === component ? node : null;
}

function toNode(block: BlockNode, editIds: boolean): LayoutNode {
  return {
    component: block.type,
    props: block.props,
    ...(block.children?.length
      ? { children: block.children.map((child) => toNode(child, editIds)) }
      : {}),
    ...(editIds ? { bid: block.id } : {}),
  };
}

/**
 * Builds the layout to render for a page or the home page: the theme's own Shell, its first
 * SiteHeader and last SiteFooter, with the designer's blocks in between. Blocks that are not
 * sections are wrapped in a content-width Section. With `editIds`, each node carries its block id.
 */
export function composeLayout(
  bundle: ThemeBundle,
  kind: "page" | "home",
  doc: LayoutDoc,
  options: { editIds?: boolean } = {}
): LayoutNode {
  const template = templateFor(bundle, kind);
  const header = findFirst(template, "SiteHeader");
  const footer = findLast(template, "SiteFooter");
  const editIds = options.editIds === true;
  const body = sanitizeLayoutDoc(doc).blocks.map((block): LayoutNode => {
    const node = toNode(block, editIds);
    return block.type === "Section"
      ? node
      : { component: "Section", props: { width: "content", tone: "plain" }, children: [node] };
  });
  return {
    component: "Shell",
    props: template.component === "Shell" ? (template.props ?? {}) : {},
    children: [...(header ? [header] : []), ...body, ...(footer ? [footer] : [])],
  };
}
