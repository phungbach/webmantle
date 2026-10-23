"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  BLOCK_DEFS,
  BUILDER_TYPES,
  type BlockCategory,
  type BuilderBlockType,
} from "@/lib/builder/blocks";
import { blockIcon } from "./icons";
import { useDesigner } from "./context";

const CATEGORIES: BlockCategory[] = ["layout", "text", "media", "marketing", "posts"];

function PaletteItem({
  type,
  onAdd,
}: {
  type: BuilderBlockType;
  onAdd: (t: BuilderBlockType) => void;
}) {
  const { T } = useDesigner();
  const def = BLOCK_DEFS[type];
  const Icon = blockIcon(def.icon);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}` });
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onAdd(type)}
        title={T(`builder.blockHint.${type}`)}
        className={`flex w-full touch-none items-center gap-2.5 rounded-control border border-line bg-white px-2.5 py-2 text-left text-sm text-ink hover:border-brand-600 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${isDragging ? "opacity-40" : ""}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-subtle text-ink-2">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{T(`builder.block.${type}`)}</span>
          <span className="block truncate text-xs text-ink-3">
            {T(`builder.blockHint.${type}`)}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Searchable list of blocks, grouped by category. Items can be dragged into the tree or clicked. */
export function Palette({ onAdd }: { onAdd: (type: BuilderBlockType) => void }) {
  const { T } = useDesigner();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORIES.map((category) => ({
      category,
      types: BUILDER_TYPES.filter(
        (type) =>
          BLOCK_DEFS[type].category === category &&
          (!q ||
            T(`builder.block.${type}`).toLowerCase().includes(q) ||
            T(`builder.blockHint.${type}`).toLowerCase().includes(q))
      ),
    })).filter((g) => g.types.length > 0);
  }, [query, T]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={T("builder.search")}
          aria-label={T("builder.search")}
          className="w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.length === 0 ? (
          <p className="text-sm text-ink-3">{T("builder.noMatch")}</p>
        ) : (
          groups.map((g) => (
            <section key={g.category} className="mb-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {T(`builder.cat.${g.category}`)}
              </h3>
              <ul className="space-y-1.5">
                {g.types.map((type) => (
                  <PaletteItem key={type} type={type} onAdd={onAdd} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
