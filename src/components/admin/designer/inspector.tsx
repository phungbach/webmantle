"use client";

import { BLOCK_DEFS } from "@/lib/builder/blocks";
import { useDesigner } from "./context";
import { FieldEditor } from "./fields";
import type { BlockNode } from "./types";
import type { BlockIssue } from "./validate";

/** Form for the selected block, generated from BLOCK_DEFS[type].fields. */
export function Inspector({
  node,
  issues,
  onChange,
}: {
  node: BlockNode | null;
  issues: BlockIssue[];
  onChange: (props: Record<string, unknown>) => void;
}) {
  const { T } = useDesigner();
  if (!node) {
    return <p className="p-4 text-sm text-ink-3">{T("builder.nothingSelected")}</p>;
  }
  const def = BLOCK_DEFS[node.type];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <h2 className="text-base font-semibold text-ink">{T(`builder.block.${node.type}`)}</h2>
      <p className="mb-4 text-xs text-ink-3">{T(`builder.blockHint.${node.type}`)}</p>
      {def.fields.length === 0 ? (
        <p className="text-sm text-ink-3">{T("builder.noOptions")}</p>
      ) : (
        <div className="space-y-4">
          {def.fields.map((field) => (
            <FieldEditor
              key={`${node.id}-${field.name}`}
              field={field}
              value={node.props[field.name]}
              uid={`f-${node.id}-${field.name}`}
              blockKey={node.id}
              issues={issues.filter((i) => i.path[0] === field.name)}
              onChange={(value) => {
                const next = { ...node.props };
                if (value === undefined) delete next[field.name];
                else next[field.name] = value;
                onChange(next);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
