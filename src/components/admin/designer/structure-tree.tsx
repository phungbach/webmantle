"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { BLOCK_DEFS } from "@/lib/builder/blocks";
import { blockIcon } from "./icons";
import { useDesigner } from "./context";
import { summary, type FlatRow } from "./tree";

export type DropHint = {
  overId: string;
  placement: "before" | "after" | "into" | "end";
  valid: boolean;
} | null;

export type TreeActions = {
  select: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
};

function Row({
  row,
  selected,
  hint,
  actions,
}: {
  row: FlatRow;
  selected: boolean;
  hint: DropHint;
  actions: TreeActions;
}) {
  const { T } = useDesigner();
  const { node } = row;
  const def = BLOCK_DEFS[node.type];
  const Icon = blockIcon(def.icon);
  const drag = useDraggable({ id: `row:${node.id}` });
  const drop = useDroppable({ id: `row:${node.id}` });
  const mine = hint && hint.overId === `row:${node.id}` ? hint : null;
  const text = summary(node);
  const indicator = !mine
    ? ""
    : !mine.valid
      ? "bg-danger-50 ring-2 ring-inset ring-danger-600"
      : mine.placement === "into"
        ? "bg-brand-50 ring-2 ring-inset ring-brand-600"
        : mine.placement === "before"
          ? "shadow-[inset_0_2px_0_0_#3B5BDB]"
          : "shadow-[inset_0_-2px_0_0_#3B5BDB]";

  return (
    <div
      ref={(el) => {
        drop.setNodeRef(el);
      }}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-posinset={row.index + 1}
      aria-setsize={row.siblings}
      className={`group relative flex items-center rounded-control ${indicator} ${drag.isDragging ? "opacity-40" : ""} ${selected ? "bg-brand-50" : "hover:bg-canvas"}`}
      style={{ paddingLeft: row.depth * 16 }}
    >
      <button
        ref={drag.setNodeRef}
        type="button"
        {...drag.attributes}
        {...drag.listeners}
        aria-label={`${T("builder.drag")}: ${T(`builder.block.${node.type}`)}`}
        className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-ink-3 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-row-id={node.id}
        onClick={() => actions.select(node.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <Icon className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
        <span
          className={`shrink-0 ${selected ? "font-semibold text-brand-700" : "font-medium text-ink"}`}
        >
          {T(`builder.block.${node.type}`)}
        </span>
        {text ? <span className="min-w-0 truncate text-xs text-ink-3">{text}</span> : null}
      </button>
      <span className="flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover:opacity-100">
        <RowButton
          label={T("builder.moveUp")}
          onClick={() => actions.move(node.id, -1)}
          disabled={false}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </RowButton>
        <RowButton
          label={T("builder.moveDown")}
          onClick={() => actions.move(node.id, 1)}
          disabled={false}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </RowButton>
        <RowButton
          label={T("builder.duplicate")}
          onClick={() => actions.duplicate(node.id)}
          disabled={false}
        >
          <Copy className="h-3.5 w-3.5" />
        </RowButton>
        <RowButton
          label={T("builder.delete")}
          onClick={() => actions.remove(node.id)}
          disabled={false}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </RowButton>
      </span>
    </div>
  );
}

function RowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      {children}
    </button>
  );
}

/** Nested list of the document. Rows are drag sources and drop targets. */
export function StructureTree({
  rows,
  selectedId,
  hint,
  actions,
}: {
  rows: FlatRow[];
  selectedId: string | null;
  hint: DropHint;
  actions: TreeActions;
}) {
  const { T } = useDesigner();
  const end = useDroppable({ id: "end" });
  const endActive = hint?.overId === "end";

  // Arrow keys move between rows; Alt+arrows reorder the focused block.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const id = target.getAttribute("data-row-id");
    if (!id) return;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      actions.move(id, e.key === "ArrowUp" ? -1 : 1);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.focus()
      );
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const all = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-row-id]"));
      const next = all[all.indexOf(target) + (e.key === "ArrowUp" ? -1 : 1)];
      next?.focus();
    } else if (e.key === "Delete") {
      e.preventDefault();
      actions.remove(id);
    }
  };

  return (
    <div
      role="tree"
      aria-label={T("builder.structure")}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto p-2"
    >
      {rows.length === 0 ? (
        <p className="px-2 py-4 text-sm text-ink-3">{T("builder.emptyHint")}</p>
      ) : (
        rows.map((row) => (
          <Row
            key={row.node.id}
            row={row}
            selected={row.node.id === selectedId}
            hint={hint}
            actions={actions}
          />
        ))
      )}
      <div
        ref={end.setNodeRef}
        aria-hidden="true"
        className={`mt-1 flex h-10 items-center justify-center rounded-control border border-dashed text-xs ${endActive ? (hint?.valid ? "border-brand-600 bg-brand-50 text-brand-700" : "border-danger-600 bg-danger-50 text-danger-600") : "border-line text-ink-3"}`}
      >
        {T("builder.dropHere")}
      </div>
    </div>
  );
}
