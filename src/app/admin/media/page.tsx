import Link from "next/link";
import { prisma } from "@/lib/db";
import { Upload } from "lucide-react";
import {
  Button,
  Card,
  Field,
  FilterTabs,
  Flash,
  RowDelete,
  SearchBox,
  Toolbar,
} from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { deleteMediaAction, uploadMediaAction } from "@/app/admin/actions/content";
import { MEDIA_MAX_BYTES } from "@/lib/media";
import { queryParam } from "@/lib/http";
import { listHref, pick } from "@/lib/admin/list";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const T = tr(await getLocale());
  const q = queryParam(params.q);
  const filter = pick(params.filter, ["noalt"] as const);
  const scope = q ? { OR: [{ altText: { contains: q } }, { filename: { contains: q } }] } : {};
  const [items, total, missingAlt] = await Promise.all([
    prisma.media.findMany({
      where: { ...scope, ...(filter === "noalt" ? { altText: "" } : {}) },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.media.count({ where: scope }),
    prisma.media.count({ where: { ...scope, altText: "" } }),
  ]);
  const tab = (label: string, value: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/media", { q, filter: value }),
    active: filter === value,
  });

  return (
    <>
      <PageHeader
        title={T("admin.nav.media")}
        action={
          <Link href="/admin/media?upload=1">
            <Button icon={Upload}>{T("media.uploadButton")}</Button>
          </Link>
        }
      />
      <Flash ok={params.ok} error={params.error} />

      {params.upload ? (
        <Card className="mb-6">
          <form action={uploadMediaAction} className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {T("media.image")}
              </span>
              <input
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                required
                className="text-sm"
              />
              <span className="mt-1 block text-xs text-ink-3">
                {T("media.maxSize", { size: Math.round(MEDIA_MAX_BYTES / 1024 / 1024) })}
              </span>
            </label>
            <div className="sm:col-span-1">
              <Field
                label={T("media.altText")}
                name="altText"
                maxLength={300}
                placeholder={T("media.altPlaceholder")}
              />
            </div>
            <div>
              <Button icon={Upload}>{T("media.upload")}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Toolbar>
        <FilterTabs
          label={T("media.title")}
          tabs={[tab(T("ui.all"), "", total), tab(T("media.tabMissingAlt"), "noalt", missingAlt)]}
        />
        <SearchBox placeholder={T("media.searchHint")} defaultValue={q} hidden={{ filter }} />
      </Toolbar>

      {items.length === 0 ? (
        <p className="text-sm text-ink-3">{T("media.none")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((m) => (
            <Card key={m.id} className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/media/${m.id}`}
                alt={m.altText}
                loading="lazy"
                className="mb-3 h-40 w-full rounded-control bg-subtle object-cover"
              />
              <p className="truncate text-sm font-medium text-ink">
                {m.altText || <em className="font-normal text-ink-3">{T("media.noAlt")}</em>}
              </p>
              <p className="text-xs text-ink-3">
                {formatBytes(m.byteSize)}
                {m.width && m.height ? ` · ${m.width} × ${m.height}` : ""}
              </p>
              <div className="mt-2">
                <RowDelete
                  action={deleteMediaAction}
                  message={T("media.deleteConfirm")}
                  fields={{ id: m.id }}
                  label={T("media.delete")}
                  showLabel
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
