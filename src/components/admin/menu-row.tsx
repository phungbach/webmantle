"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/admin/ui";
import { Plus, Trash2 } from "lucide-react";
import { Icon } from "@/components/admin/icon";

export type MenuTarget = { label: string; href: string };
export type MenuTargetGroup = { label: string; options: MenuTarget[] };
export type MenuEditorRow = { label: string; href: string; child: boolean };

type Texts = {
  label: string;
  href: string;
  level: string;
  top: string;
  childLabel: string;
  pick: string;
  add: string;
  remove: string;
  save: string;
};

/**
 * Menu editor: a list of rows that can be added and removed, then saved as one form. Picking an
 * existing page or category fills the link (and the name, when the name is still empty).
 */
export function MenuEditor({
  action,
  initialRows,
  groups,
  max,
  texts,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initialRows: MenuEditorRow[];
  groups: MenuTargetGroup[];
  max: number;
  texts: Texts;
}) {
  // Each row keeps a stable id, so removing one row does not reset the others.
  const nextId = useRef(initialRows.length);
  const [rows, setRows] = useState(() => initialRows.map((row, id) => ({ id, row })));

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="rowCount" value={rows.length} />
      <div className="hidden gap-2 text-xs font-medium text-ink-3 sm:grid sm:grid-cols-[1fr_1.4fr_11rem_9rem] sm:pr-10">
        <span>{texts.label}</span>
        <span>{texts.href}</span>
        <span>{texts.pick}</span>
        <span>{texts.level}</span>
      </div>
      {rows.map(({ id, row }, index) => (
        <div key={id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <MenuRow index={index} row={row} groups={groups} texts={texts} />
          </div>
          <button
            type="button"
            aria-label={texts.remove}
            title={texts.remove}
            onClick={() => setRows((list) => list.filter((r) => r.id !== id))}
            className="mt-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-danger-50 hover:text-danger-600"
          >
            <Icon icon={Trash2} className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          disabled={rows.length >= max}
          onClick={() =>
            setRows((list) => [
              ...list,
              { id: nextId.current++, row: { label: "", href: "", child: false } },
            ])
          }
          className="flex items-center gap-1.5 rounded-control border border-line-strong px-3 py-2 text-sm font-medium hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon icon={Plus} className="h-3.5 w-3.5" />
          {texts.add}
        </button>
        <Button>{texts.save}</Button>
      </div>
    </form>
  );
}

function MenuRow({
  index,
  row,
  groups,
  texts,
}: {
  index: number;
  row: MenuEditorRow;
  groups: MenuTargetGroup[];
  texts: Texts;
}) {
  const [label, setLabel] = useState(row.label);
  const [href, setHref] = useState(row.href);
  const inputClass = "w-full rounded-control border border-line-strong px-2.5 py-1.5 text-sm";

  function pick(value: string) {
    const found = groups.flatMap((g) => g.options).find((o) => o.href === value);
    if (!found) return;
    setHref(found.href);
    if (!label.trim()) setLabel(found.label);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_11rem_9rem]">
      <input
        name={`label_${index}`}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={60}
        aria-label={texts.label}
        className={inputClass}
      />
      <input
        name={`href_${index}`}
        value={href}
        onChange={(e) => setHref(e.target.value)}
        maxLength={300}
        placeholder="/pages/gioi-thieu"
        aria-label={texts.href}
        className={inputClass}
      />
      <select
        value=""
        onChange={(e) => pick(e.target.value)}
        aria-label={texts.pick}
        className={inputClass}
      >
        <option value="">{texts.pick}</option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.href} value={option.href}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <select
        name={`level_${index}`}
        defaultValue={row.child ? "child" : "top"}
        aria-label={texts.level}
        className={inputClass}
      >
        <option value="top">{texts.top}</option>
        <option value="child">{texts.childLabel}</option>
      </select>
    </div>
  );
}
