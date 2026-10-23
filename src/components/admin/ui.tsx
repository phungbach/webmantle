import Link from "next/link";
import type { LucideIcon } from "@/components/admin/icon";
import { CircleCheck, Search, Trash2, TriangleAlert } from "lucide-react";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { Icon } from "@/components/admin/icon";

// Shared admin primitives. Styles follow the Figma "CMS quản trị" components:
// Button, Badge, Field, Alert, Card (radius 12, 1px line border, soft shadow).

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  const text = error ?? ok ?? "";
  const tone = error
    ? "border-danger-600/30 bg-danger-50 text-danger-600"
    : "border-success-600/30 bg-success-50 text-success-600";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-6 flex items-start gap-2 rounded-control border px-4 py-3 text-sm font-medium ${tone}`}
    >
      <Icon icon={error ? TriangleAlert : CircleCheck} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}
    >
      {children}
    </section>
  );
}

const controlClass =
  "w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  hint,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      <input
        className={controlClass}
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
      />
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 6,
  hint,
  mono,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      <textarea
        className={`${controlClass} ${mono ? "font-mono" : ""}`}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
      />
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "submit",
  icon,
  className = "",
  form,
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  type?: "submit" | "button";
  icon?: LucideIcon;
  className?: string;
  /** Id of a form elsewhere on the page, so a header button can submit it. */
  form?: string;
  name?: string;
  value?: string;
}) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-line-strong bg-white text-ink hover:bg-subtle",
    danger: "border border-danger-600/30 bg-white text-danger-600 hover:bg-danger-50",
  };
  return (
    <button
      type={type}
      form={form}
      name={name}
      value={value}
      className={`inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${styles[variant]} ${className}`}
    >
      {icon ? <Icon icon={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export type Tone = "success" | "warning" | "neutral" | "danger";

const TONES: Record<Tone, string> = {
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  neutral: "bg-subtle text-ink-2",
  danger: "bg-danger-50 text-danger-600",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  published: "success",
  active: "success",
  draft: "warning",
  archived: "neutral",
  installed: "neutral",
  invalid: "danger",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return <Badge tone={STATUS_TONE[value] ?? "neutral"}>{label ?? value}</Badge>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-ink-3">
        {children}
      </td>
    </tr>
  );
}

export function Pager({
  basePath,
  page,
  totalPages,
  query,
  labels,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  query?: Record<string, string>;
  labels: { previous: string; next: string; pageOf: string; label: string };
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams({ ...(query ?? {}), page: String(p) });
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav
      className="mt-4 flex items-center justify-between text-sm text-ink-2"
      aria-label={labels.label}
    >
      {page > 1 ? (
        <Link className="font-medium text-brand-600 hover:underline" href={href(page - 1)}>
          {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span>{labels.pageOf}</span>
      {page < totalPages ? (
        <Link className="font-medium text-brand-600 hover:underline" href={href(page + 1)}>
          {labels.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export type FilterTab = { label: string; count: number; href: string; active: boolean };

/** Pill filters with a count, e.g. "Đã đăng · 119". The active pill is dark. */
export function FilterTabs({ tabs, label }: { tabs: FilterTab[]; label?: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.active ? "true" : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${
            tab.active
              ? "border-ink bg-ink text-white"
              : "border-line-strong bg-white text-ink-2 hover:bg-subtle"
          }`}
        >
          {tab.label} · {tab.count}
        </Link>
      ))}
    </nav>
  );
}

/** GET search box with a magnifier. `hidden` keeps the other filters when searching. */
export function SearchBox({
  placeholder,
  defaultValue,
  hidden,
}: {
  placeholder: string;
  defaultValue?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" role="search" className="relative w-full sm:w-[300px]">
      {Object.entries(hidden ?? {})
        .filter(([, value]) => value)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <Icon
        icon={Search}
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
      />
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={100}
        className={`${controlClass} pl-9`}
      />
    </form>
  );
}

/** Row above a list: filter pills on the left, search on the right. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

export const rowClass = "hover:bg-canvas";
export const cellClass = "px-3 py-3.5 align-middle";

/** Card with a title and a table that has a grey header strip. Pass the <tr> rows as children. */
export function DataTable({
  title,
  head,
  empty,
  children,
}: {
  title: string;
  head: (string | { label: string; className?: string })[];
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold text-ink">{title}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-[640px] text-sm text-ink md:min-w-full md:w-full">
          <thead>
            <tr className="bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {head.map((h) => {
                const col = typeof h === "string" ? { label: h } : h;
                return (
                  <th
                    key={col.label}
                    className={`px-3 py-2 font-semibold first:rounded-l-control last:rounded-r-control ${col.className ?? ""}`}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{empty ? <EmptyRow colSpan={head.length}>{empty}</EmptyRow> : children}</tbody>
        </table>
      </div>
    </Card>
  );
}

/** Number card for the dashboard and analytics: label, big value, optional coloured hint. */
export function StatCard({
  label,
  value,
  hint,
  tone = "success",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "success" | "warning" | "neutral";
}) {
  const hintTone = {
    success: "text-success-600",
    warning: "text-warning-600",
    neutral: "text-ink-3",
  };
  return (
    <Card>
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-9 tracking-tight text-ink">{value}</p>
      {hint ? <p className={`mt-1 text-xs font-medium ${hintTone[tone]}`}>{hint}</p> : null}
    </Card>
  );
}

/** Small coloured note, used for the editor's SEO checks and the settings status. */
export function Note({
  tone,
  children,
}: {
  tone: "success" | "danger";
  children: React.ReactNode;
}) {
  const styles =
    tone === "success" ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600";
  return (
    <p
      className={`flex items-start gap-2.5 rounded-control px-3.5 py-3 text-sm font-medium ${styles}`}
    >
      <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-current" />
      <span>{children}</span>
    </p>
  );
}

/** Actions at the end of a table row: one line, right-aligned. */
export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2">{children}</div>;
}

/** A compact outlined link for a row ("Design", "Edit"), with an icon. */
export function RowLink({
  href,
  icon: Glyph,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <Glyph className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Link>
  );
}

/**
 * Delete for a row, behind a confirmation. An icon button by default; with `showLabel` (for cards)
 * it also shows the word.
 */
export function RowDelete({
  action,
  message,
  fields,
  label,
  showLabel = false,
}: {
  action: (formData: FormData) => Promise<void>;
  message: string;
  fields: Record<string, string>;
  /** Accessible name, e.g. "Delete: About us". */
  label: string;
  showLabel?: boolean;
}) {
  return (
    <ConfirmForm action={action} message={message} fields={fields}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className={
          showLabel
            ? "inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-danger-600/40 hover:bg-danger-50 hover:text-danger-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-600"
            : "flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-danger-50 hover:text-danger-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-600"
        }
      >
        <Trash2 className={showLabel ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        {showLabel ? label : null}
      </button>
    </ConfirmForm>
  );
}
