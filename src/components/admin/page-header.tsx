import { AdminTools } from "@/components/admin/admin-tools";

// Title on the left; page action, language switch and avatar on the right (same row, as in Figma).
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-ink">{title}</h1>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {action}
          <AdminTools />
        </div>
      </div>
      {description ? <p className="-mt-3 mb-6 text-sm text-ink-2">{description}</p> : null}
    </>
  );
}
