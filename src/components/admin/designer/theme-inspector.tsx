"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, ImageIcon, Plus, Trash2 } from "lucide-react";
import { HEADING_LEVELS, ICON_KEYS } from "@/lib/themes/content-schemas";
import { useDesigner } from "./context";
import { MediaPicker } from "./media-picker";
import { cloneJson, containerPath, getAt, isObject, splitPath, type Json } from "./content-path";

const control =
  "w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";
const LONG = new Set(["text", "bio", "quote", "description", "contact", "copyright", "subtitle"]);
const TITLE_KEYS = ["title", "name", "label", "city", "ext", "quote"];
/** Optional fields an editor can add, by the name of the content block they belong to. */
const OPTIONAL_BY_FIELD: Record<string, RegExp> = {
  image: /^(hero|courses|projects|title|cta|features|process|values|teachers)/,
  icon: /^(features|stats|process|values)/,
  badge: /^(courses|projects|pricing)/,
  href: /^(features|process|values)/,
};
/** Optional fields that only make sense on the block itself (not on its list items), with their start value. */
const OPTIONAL_ON_BLOCK: Record<string, { rule: RegExp; start: string }> = {
  headingLevel: { rule: /^(hero|title|cta|search|pricing)/, start: "h2" },
  href: { rule: /^title/, start: "/" },
  linkLabel: { rule: /^title/, start: "" },
};

const validHref = (v: string) =>
  (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\/\S+$/.test(v);

type Ops = {
  content: Record<string, Json>;
  base: Record<string, Json>;
  /** Sets a value by dotted path. */
  set: (path: string, value: Json) => void;
  /** Removes an optional field or array item. */
  remove: (path: string) => void;
  select: (path: string) => void;
};

function useLabels() {
  const { T } = useDesigner();
  const pretty = (name: string) =>
    name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return {
    field: (name: string) => {
      const text = T(`builder.tf.${name}`);
      return text === `builder.tf.${name}` ? pretty(name) : text;
    },
    block: (key: string) => {
      const text = T(`builder.tc.${key}`);
      if (text !== `builder.tc.${key}`) return text;
      if (key.startsWith("hero")) return T("builder.tc.hero");
      if (key.startsWith("title")) return T("builder.tc.title");
      return pretty(key);
    },
  };
}

function itemTitle(item: Json, fallback: string): string {
  if (!isObject(item)) return fallback;
  for (const k of TITLE_KEYS) if (typeof item[k] === "string" && item[k]) return String(item[k]);
  return fallback;
}

function StringField({
  name,
  path,
  value,
  ops,
}: {
  name: string;
  path: string;
  value: string;
  ops: Ops;
}) {
  const { T } = useDesigner();
  const labels = useLabels();
  const id = `tc-${path}`;
  const isLink = /href$/i.test(name);
  const long = LONG.has(name) || value.length > 100 || value.includes("\n");
  const error = isLink && value && !validHref(value) ? T("builder.invalidThemeLink") : null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
        {labels.field(name)}
      </label>
      {long ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => ops.set(path, e.target.value)}
          className={control}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => ops.set(path, e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          placeholder={isLink ? "/page or https://…" : undefined}
          className={control}
        />
      )}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IconField({ path, value, ops }: { path: string; value: string; ops: Ops }) {
  const { T } = useDesigner();
  const labels = useLabels();
  const id = `tc-${path}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
        {labels.field("icon")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => ops.set(path, e.target.value)}
        className={control}
      >
        {ICON_KEYS.map((k) => (
          <option key={k} value={k}>
            {T(`builder.icon.${k}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

function HeadingLevelField({ path, value, ops }: { path: string; value: string; ops: Ops }) {
  const labels = useLabels();
  const id = `tc-${path}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
        {labels.field("headingLevel")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => ops.set(path, e.target.value)}
        className={control}
      >
        {HEADING_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

function ImageField({ path, value, ops }: { path: string; value: string; ops: Ops }) {
  const { T } = useDesigner();
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const segs = splitPath(path);
  const baseValue = getAt(ops.base, segs);
  const url = value.startsWith("media/") ? `/media/${value.slice(6)}` : null;
  return (
    <div>
      <span className="mb-1 block text-[13px] font-medium text-ink">{labels.field("image")}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-subtle text-ink-3">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- CMS media route
            <img src={`${url}?w=320`} alt="" className="h-full w-full object-cover" />
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
          {typeof baseValue === "string" && baseValue !== value ? (
            <button
              type="button"
              onClick={() => ops.set(path, baseValue)}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {T("builder.useThemeImage")}
            </button>
          ) : null}
          {baseValue === undefined ? (
            <button
              type="button"
              onClick={() => ops.remove(path)}
              className="text-xs font-medium text-danger-600 hover:underline"
            >
              {T("builder.removeImage")}
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 break-all text-xs text-ink-3">{value}</p>
      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          ops.set(path, `media/${id}`);
          setOpen(false);
        }}
      />
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

function StringList({
  name,
  path,
  items,
  ops,
}: {
  name: string;
  path: string;
  items: string[];
  ops: Ops;
}) {
  const { T } = useDesigner();
  const labels = useLabels();
  const swap = (i: number, j: number) => {
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    ops.set(path, next);
  };
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-ink">{labels.field(name)}</legend>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={item}
              aria-label={`${labels.field(name)} ${i + 1}`}
              onChange={(e) => ops.set(`${path}.${i}`, e.target.value)}
              className={control}
            />
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
              onClick={() =>
                ops.set(
                  path,
                  items.filter((_, k) => k !== i)
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => ops.set(path, [...items, ""])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {T("builder.addItem")}
      </button>
    </fieldset>
  );
}

function ObjectArray({
  name,
  path,
  items,
  ops,
  focusPath,
}: {
  name: string;
  path: string;
  items: Json[];
  ops: Ops;
  focusPath: string;
}) {
  const { T } = useDesigner();
  const labels = useLabels();
  const swap = (i: number, j: number) => {
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    ops.set(path, next);
  };
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-ink">{labels.field(name)}</legend>
      <ul className="space-y-2">
        {items.map((item, i) => {
          const at = `${path}.${i}`;
          return (
            <li key={i} className="rounded-control border border-line bg-canvas">
              <details open={focusPath === at || focusPath.startsWith(`${at}.`)}>
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-ink">
                  <span className="min-w-0 truncate">
                    {i + 1}. {itemTitle(item, labels.field(name))}
                  </span>
                  <span className="flex shrink-0" onClick={(e) => e.stopPropagation()}>
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
                      label={T("builder.duplicate")}
                      onClick={() => {
                        const next = [...items];
                        next.splice(i + 1, 0, cloneJson(item));
                        ops.set(path, next);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={T("builder.removeItem")}
                      onClick={() =>
                        ops.set(
                          path,
                          items.filter((_, k) => k !== i)
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </span>
                </summary>
                <div className="border-t border-line p-3">
                  <ObjectEditor path={at} ops={ops} focusPath={focusPath} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {items.length > 0 ? (
        <button
          type="button"
          onClick={() => ops.set(path, [...items, cloneJson(items[items.length - 1])])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {T("builder.addItem")}
        </button>
      ) : null}
    </fieldset>
  );
}

/** Fields of one content object, generated from what it holds. */
function ObjectEditor({ path, ops, focusPath }: { path: string; ops: Ops; focusPath: string }) {
  const { T } = useDesigner();
  const labels = useLabels();
  const value = getAt(ops.content, splitPath(path));
  if (!isObject(value)) return null;
  const top = splitPath(path)[0] ?? "";
  const onBlock = splitPath(path).length === 1;
  const missing: [string, string][] = [
    ...Object.entries(OPTIONAL_BY_FIELD)
      .filter(([field, rule]) => !(field in value) && rule.test(top))
      .map(([field]): [string, string] => [
        field,
        field === "icon" ? "check" : field === "href" ? "/" : "",
      ]),
    ...(onBlock
      ? Object.entries(OPTIONAL_ON_BLOCK)
          .filter(([field, { rule }]) => !(field in value) && rule.test(top))
          .map(([field, { start }]): [string, string] => [field, start])
      : []),
  ];
  return (
    <div className="space-y-3">
      {Object.entries(value).map(([name, v]) => {
        const at = `${path}.${name}`;
        if (typeof v === "string") {
          if (name === "image") return <ImageField key={name} path={at} value={v} ops={ops} />;
          if (name === "icon") return <IconField key={name} path={at} value={v} ops={ops} />;
          if (name === "headingLevel")
            return <HeadingLevelField key={name} path={at} value={v} ops={ops} />;
          return <StringField key={name} name={name} path={at} value={v} ops={ops} />;
        }
        if (Array.isArray(v)) {
          return v.every((x) => typeof x === "string") ? (
            <StringList key={name} name={name} path={at} items={v as string[]} ops={ops} />
          ) : (
            <ObjectArray
              key={name}
              name={name}
              path={at}
              items={v}
              ops={ops}
              focusPath={focusPath}
            />
          );
        }
        if (isObject(v)) {
          return (
            <fieldset key={name} className="rounded-control border border-line p-3">
              <legend className="px-1 text-[13px] font-medium text-ink">
                {labels.field(name)}
              </legend>
              <ObjectEditor path={at} ops={ops} focusPath={focusPath} />
            </fieldset>
          );
        }
        return null;
      })}
      {missing.length > 0 ? (
        <p className="flex flex-wrap gap-2">
          {missing.map(([field, start]) => (
            <button
              key={field}
              type="button"
              onClick={() => ops.set(`${path}.${field}`, start)}
              className="inline-flex items-center gap-1 rounded-control border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              {T("builder.addField", { name: labels.field(field) })}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** Move, duplicate, delete and add for a selected item that sits in a list (a course, a plan, a link...). */
function ItemToolbar({
  segs,
  ops,
  select,
}: {
  segs: string[];
  ops: Ops;
  select: (path: string) => void;
}) {
  const { T } = useDesigner();
  const last = segs[segs.length - 1];
  if (segs.length < 2 || last === undefined || !/^\d+$/.test(last)) return null;
  const parentSegs = segs.slice(0, -1);
  const parentPath = parentSegs.join(".");
  const list = getAt(ops.content, parentSegs);
  if (!Array.isArray(list)) return null;
  const index = Number(last);
  const go = (next: Json[], to: number) => {
    ops.set(parentPath, next);
    select(`${parentPath}.${Math.max(0, Math.min(to, next.length - 1))}`);
  };
  const swap = (to: number) => {
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    go(next, to);
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-control border border-line bg-canvas px-2 py-1">
      <span className="mr-auto text-xs text-ink-2">
        {index + 1} / {list.length}
      </span>
      <IconButton
        label={T("builder.moveUp")}
        disabled={index === 0}
        onClick={() => swap(index - 1)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label={T("builder.moveDown")}
        disabled={index === list.length - 1}
        onClick={() => swap(index + 1)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label={T("builder.duplicate")}
        onClick={() => {
          const next = [...list];
          next.splice(index + 1, 0, cloneJson(list[index]));
          go(next, index + 1);
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label={T("builder.addItem")}
        onClick={() => go([...list, cloneJson(list[list.length - 1])], list.length)}
      >
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label={T("builder.removeItem")}
        onClick={() =>
          go(
            list.filter((_, k) => k !== index),
            index
          )
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

/** Inspector for a selected piece of the theme's own content. */
export function ThemeInspector({
  path,
  content,
  base,
  draftKeys,
  edited,
  set,
  remove,
  select,
  reset,
}: {
  path: string;
  content: Record<string, Json>;
  base: Record<string, Json>;
  draftKeys: string[];
  edited: (key: string) => boolean;
  set: (path: string, value: Json) => void;
  remove: (path: string) => void;
  select: (path: string) => void;
  reset: (key: string) => void;
}) {
  const { T } = useDesigner();
  const labels = useLabels();
  const segs = containerPath(content, path);
  const key = splitPath(path)[0] ?? "";
  const ops: Ops = { content, base, set, remove, select };
  const parentSegs = segs.slice(0, -1);
  const parent = containerPath(content, parentSegs.join("."));
  const isEdited = edited(key);
  const hasDraft = draftKeys.includes(key);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-ink">{labels.block(key)}</h2>
        {isEdited ? (
          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-600">
            {T("builder.edited")}
          </span>
        ) : null}
        {hasDraft ? (
          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">
            {T("builder.unpublished")}
          </span>
        ) : null}
      </div>
      <p className="mb-1 text-xs text-ink-3">{T("builder.themeSiteWide")}</p>
      <p className="mb-4 break-all text-xs text-ink-3">{segs.join(" › ")}</p>
      {parent.length > 0 && parent.length < segs.length ? (
        <button
          type="button"
          onClick={() => select(parent.join("."))}
          className="mb-3 text-xs font-medium text-brand-600 hover:underline"
        >
          {T("builder.selectParent")}
        </button>
      ) : null}
      <ItemToolbar segs={segs} ops={ops} select={select} />
      {segs.length === 0 ? (
        <p className="text-sm text-ink-3">{T("builder.noOptions")}</p>
      ) : (
        <ObjectEditor path={segs.join(".")} ops={ops} focusPath={path} />
      )}
      {isEdited || hasDraft ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(T("builder.resetKeyConfirm", { name: labels.block(key) })))
              reset(key);
          }}
          className="mt-5 text-sm font-medium text-danger-600 hover:underline"
        >
          {T("builder.resetKey")}
        </button>
      ) : null}
    </div>
  );
}
