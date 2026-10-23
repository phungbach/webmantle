import { components } from "@/components/theme/components";
import type { RenderContext } from "@/components/theme/types";
import { COMPONENT_PROPS, type LayoutNode, type ComponentName } from "@/lib/themes/contract";

/**
 * Renders a declarative layout tree. Props are re-parsed here, so a template that somehow bypassed
 * install-time validation still cannot pass unexpected values into a component.
 */
export function RenderLayout({ node, ctx }: { node: LayoutNode; ctx: RenderContext }) {
  const name = node.component as ComponentName;
  const schema = COMPONENT_PROPS[name];
  const parsed = schema.safeParse(node.props ?? {});
  if (!parsed.success) return null;
  const Component = components[name] as (args: {
    props: unknown;
    ctx: RenderContext;
    children?: React.ReactNode;
  }) => React.ReactNode;
  const children = (node.children ?? []).map((child, index) => (
    <RenderLayout key={index} node={child} ctx={ctx} />
  ));
  const output = Component({ props: parsed.data, ctx, children });
  if (ctx.edit && node.bid) {
    return (
      <div data-bid={node.bid} data-btype={node.component} style={{ display: "contents" }}>
        {output}
      </div>
    );
  }
  return <>{output}</>;
}
