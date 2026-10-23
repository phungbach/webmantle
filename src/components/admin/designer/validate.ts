import { COMPONENT_PROPS } from "@/lib/themes/contract";
import { isContainer } from "@/lib/builder/blocks";
import { LIMITS, type BlockNode, type LayoutDoc } from "./types";
import { countNodes } from "./tree";

export type BlockIssue = { path: (string | number)[]; message: string };

/** Problems per block id, using the same prop schemas as the server and the renderer. */
export function validateDoc(doc: LayoutDoc): { ok: boolean; issues: Map<string, BlockIssue[]> } {
  const issues = new Map<string, BlockIssue[]>();
  const add = (id: string, issue: BlockIssue) => issues.set(id, [...(issues.get(id) ?? []), issue]);
  const walk = (nodes: BlockNode[], depth: number, parent: BlockNode | null) => {
    for (const node of nodes) {
      const parsed = COMPONENT_PROPS[node.type].safeParse(node.props);
      if (!parsed.success)
        for (const i of parsed.error.issues) add(node.id, { path: i.path, message: i.message });
      if (depth > LIMITS.depth) add(node.id, { path: [], message: "depth" });
      if (node.type === "Section" && parent) add(node.id, { path: [], message: "section" });
      if (node.children?.length && !isContainer(node.type))
        add(node.id, { path: [], message: "container" });
      if (node.children) walk(node.children, depth + 1, node);
    }
  };
  walk(doc.blocks, 1, null);
  const tooMany = countNodes(doc.blocks) > LIMITS.nodes;
  return { ok: issues.size === 0 && !tooMany, issues };
}
