"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from "lucide-react";
import type { Field } from "@/lib/builder/blocks";
import { linkSchema } from "@/lib/themes/contract";
import { useDesigner } from "./context";
import { MediaPicker } from "./media-picker";
import type { BlockIssue } from "./validate";

const RichTextEditor = dynamic(
  () => import("@/components/admin/editor/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-control bg-subtle" /> }
);

const control =
  "w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

type Props = {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Unique id prefix for label wiring. */
  uid: string;
  issues: BlockIssue[];
  /** Used to remount the rich text editor when another block is selected. */
  blockKey: string;
};

const asString = (v: unknown) => (typeof v === "string" ? v : "");

function MediaField({
  value,
  onChange,
  optional,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  optional: boolean;
}) {
  const { T } = useDesigner();
  const [open, setOpen] = useState(false);
  const id = asString(value);
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-subtle text-ink-3">
        {id ? (
          // eslint-disable-next-line @next/next/no-img-element -- CMS media route
          <img src={`/media/${id}?w=320`} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-control border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          {T("builder.pickImage")}
        </button>
        {id && optional ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs font-medium text-danger-600 hover:underline"
          >
            {T("builder.removeImage")}
          </button>
        ) : null}
      </div>
      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => {
          onChange(picked);
          setOpen(false);
        }}
      />
    </div>
  );
}

function ListField({ field, value, onChange, uid, issues, blockKey }: Props) {
  const { T } = useDesigner();
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const defs = field.itemFields ?? [];
  const mediaRequired = defs.find((f) => f.kind === "media" && !f.optional);
  const [picking, setPicking] = useState(false);
  const max = field.maxItems ?? 50;
  const min = field.minItems ?? 0;

  const blank = (): Record<string, unknown> => {
    const item: Record<string, unknown> = {};
    for (const f of defs)
      if ((f.kind === "text" || f.kind === "textarea") && !f.optional)
        item[f.name] = T("builder.newItem");
    return item;
  };
  const set = (next: Record<string, unknown>[]) => onChange(next);
  const swap = (i: number, j: number) => {
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set(next);
  };

  return (
    <div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="rounded-control border border-line bg-canvas p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-2">
                {T(`builder.field.${field.name}`)} {i + 1}
              </span>
              <span className="flex">
                <IconButton
                  label={T("builder.moveUp")}
                  disabled={i === 0}
                  onClick={() => swap(i, i - 1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label={T("builder.moveDown")}
                  disabled={i === items.length - 1}
                  onClick={() => swap(i, i + 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label={T("builder.removeItem")}
                  disabled={items.length <= min}
                  onClick={() => set(items.filter((_, k) => k !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </span>
            </div>
            <div className="space-y-3">
              {defs.map((f) => (
                <FieldEditor
                  key={f.name}
                  field={f}
                  value={item[f.name]}
                  uid={`${uid}-${i}-${f.name}`}
                  blockKey={`${blockKey}-${i}`}
                  issues={issues
                    .filter((x) => x.path[1] === i && x.path[2] === f.name)
                    .map((x) => ({ ...x, path: x.path.slice(2) }))}
                  onChange={(v) => {
                    const next = { ...item };
                    if (v === undefined) delete next[f.name];
                    else next[f.name] = v;
                    set(items.map((it, k) => (k === i ? next : it)));
                  }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      {items.length < max ? (
        <>
          <button
            type="button"
            onClick={() => (mediaRequired ? setPicking(true) : set([...items, blank()]))}
            className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {T("builder.addItem")}
          </button>
          {mediaRequired ? (
            <MediaPicker
              open={picking}
              onClose={() => setPicking(false)}
              onPick={(id, alt) => {
                set([...items, { ...blank(), [mediaRequired.name]: id, alt }]);
                setPicking(false);
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Holds the editor's first content, so later re-renders never feed it a changing `initialHtml`. */
function EditorHost({ initial, onChange }: { initial: string; onChange: (html: string) => void }) {
  const { editorLabels } = useDesigner();
  const first = useRef(initial);
  return (
    <RichTextEditor
      name="html"
      initialHtml={first.current}
      labels={editorLabels}
      onChange={onChange}
    />
  );
}

/**
 * Rich text field. While the editor is mounted it is the source of truth: it reports changes from its
 * own update event, and nothing is pushed back into it. Only a change that did not come from the
 * editor (undo, redo, a re-sync) remounts it with the new content.
 */
function RichField({
  label,
  text,
  blockKey,
  onChange,
}: {
  label: string;
  text: string;
  blockKey: string;
  onChange: (html: string) => void;
}) {
  const last = useRef(text);
  const generation = useRef(0);
  if (text !== last.current) {
    last.current = text;
    generation.current += 1;
  }
  return (
    <div>
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      <EditorHost
        key={`${blockKey}-${generation.current}`}
        initial={text}
        onChange={(html) => {
          // Remember what the editor said, so the prop coming back is not mistaken for an outside edit.
          last.current = html;
          onChange(html);
        }}
      />
    </div>
  );
}

/** One form control, chosen from the field's kind. The label comes from builder.field.<name>. */
export function FieldEditor(props: Props) {
  const { field, value, onChange, uid, issues } = props;
  const { T } = useDesigner();
  const label = T(`builder.field.${field.name}`);
  const errorId = `${uid}-error`;
  const text = asString(value);

  // Link fields are checked with the same rule the server uses.
  let error = issues[0]?.message;
  if (field.kind === "link" && text) {
    const parsed = linkSchema.safeParse(text);
    if (!parsed.success) error = T("builder.invalidLink");
  }

  let control_: React.ReactNode;
  switch (field.kind) {
    case "text":
    case "link":
      control_ = (
        <input
          id={uid}
          type="text"
          value={text}
          maxLength={field.maxLength ?? 500}
          onChange={(e) =>
            onChange(
              field.optional && e.target.value === "" && field.kind === "link"
                ? undefined
                : e.target.value
            )
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={field.kind === "link" ? "/page or https://…" : undefined}
          className={control}
        />
      );
      break;
    case "textarea":
      control_ = (
        <textarea
          id={uid}
          rows={3}
          value={text}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={control}
        />
      );
      break;
    case "select":
      control_ = (
        <select
          id={uid}
          value={text}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          className={control}
        >
          {field.optional ? <option value="">—</option> : null}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {T(o.label)}
            </option>
          ))}
        </select>
      );
      break;
    case "number":
      control_ = (
        <input
          id={uid}
          type="number"
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number.parseInt(e.target.value, 10))
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={control}
        />
      );
      break;
    case "switch":
      return (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            role="switch"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
      );
    case "media":
      return (
        <div>
          <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
          <MediaField value={value} onChange={onChange} optional={field.optional === true} />
          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-xs text-danger-600">
              {error}
            </p>
          ) : null}
        </div>
      );
    case "richtext":
      return (
        <RichField
          label={label}
          text={text}
          blockKey={props.blockKey}
          onChange={(html) => onChange(html)}
        />
      );
    case "list":
      return (
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-ink">{label}</legend>
          <ListField {...props} />
          {error ? (
            <p role="alert" className="mt-1 text-xs text-danger-600">
              {error}
            </p>
          ) : null}
        </fieldset>
      );
  }

  return (
    <div>
      <label htmlFor={uid} className="mb-1 block text-[13px] font-medium text-ink">
        {label}
      </label>
      {control_}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
