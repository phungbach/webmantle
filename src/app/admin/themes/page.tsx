import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { Badge, Button, Card, DataTable, Flash, cellClass, rowClass } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { ThemeUploadForm } from "@/components/admin/theme-upload-form";
import {
  activateThemeAction,
  clearRollbackAction,
  deleteThemeBackupAction,
  restoreThemeBackupAction,
  rollbackThemeAction,
  uninstallThemeAction,
} from "@/app/admin/actions/themes";
import { createPreviewToken } from "@/lib/themes/preview-token";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { PREVIOUS_KEY } from "@/lib/themes/activate";
import { FALLBACK_THEME_ID } from "@/lib/themes/registry";
import { listThemeBackups } from "@/lib/themes/backups";
import { formatDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// A theme without a thumbnail shows "Aa" on one of three calm palettes picked from its id.
const SWATCHES = [
  { bg: "#DCE2D9", fg: "#17231F" },
  { bg: "#F0EBE4", fg: "#2A2118" },
  { bg: "#0F172A", fg: "#7DD3FC" },
];

function hashOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/** The theme's own picture (theme.json "thumbnail"), as an address the theme route serves. */
function thumbnailUrl(theme: { id: string; version: string; manifestJson: string }): string | null {
  try {
    const { thumbnail } = JSON.parse(theme.manifestJson) as { thumbnail?: unknown };
    if (
      typeof thumbnail !== "string" ||
      !/^assets\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i.test(thumbnail)
    )
      return null;
    return `/theme-assets/${theme.id}/${theme.version}/${thumbnail}`;
  } catch {
    return null;
  }
}

function customTemplateLabels(manifestJson: string): string[] {
  try {
    const manifest = JSON.parse(manifestJson) as { customTemplates?: { label: string }[] };
    return (manifest.customTemplates ?? []).map((x) => x.label);
  } catch {
    return [];
  }
}

export default async function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const user = await getCurrentUser();
  const [themes, settings, pointers, history] = await Promise.all([
    prisma.theme.findMany({ orderBy: { name: "asc" } }),
    getSiteSettings(),
    prisma.siteSetting.findMany({ where: { key: PREVIOUS_KEY } }),
    prisma.themeHistory.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const active = settings.activeThemeId ?? FALLBACK_THEME_ID;
  const rollbackTarget = pointers[0]?.value || null;
  const canManage = can(user?.role ?? "", "themes:manage");
  const backups = listThemeBackups().filter((b) => themes.some((t) => t.id === b.themeId));
  const nameOf = (id: string) => themes.find((x) => x.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title={T("admin.nav.themes")} />
      <Flash ok={params.ok} error={params.error} />

      {rollbackTarget && canManage ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-ink-2">
          <span>
            {T("common.active")}: <strong className="text-ink">{nameOf(active)}</strong>
          </span>
          <ConfirmForm
            action={clearRollbackAction}
            message={T("themes.clearRollbackConfirm", { theme: rollbackTarget })}
            fields={{}}
          >
            <button className="text-xs font-medium text-danger-600 hover:underline">
              {T("themes.clearRollback")}
            </button>
          </ConfirmForm>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {themes.length === 0 ? (
          <p className="text-sm text-ink-3">{T("themes.none")}</p>
        ) : (
          [...themes]
            .sort(
              (a, b) =>
                Number(b.id === active) - Number(a.id === active) || a.name.localeCompare(b.name)
            )
            .map((theme) => {
              const isActive = theme.id === active;
              const previewToken = canManage ? createPreviewToken(theme.id) : null;
              const blocked = isActive
                ? "active"
                : theme.id === FALLBACK_THEME_ID
                  ? "fallback"
                  : theme.id === rollbackTarget
                    ? "rollback"
                    : null;
              const extras = customTemplateLabels(theme.manifestJson);
              const thumb = thumbnailUrl(theme);
              const swatch = SWATCHES[hashOf(theme.id) % SWATCHES.length] ?? SWATCHES[0]!;
              return (
                <article
                  key={theme.id}
                  className={`flex flex-col overflow-hidden rounded-card bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${
                    isActive ? "border-2 border-brand-600" : "border border-line"
                  }`}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- picture served by the theme route
                    <img
                      src={thumb}
                      alt={theme.name}
                      width={900}
                      height={600}
                      loading="lazy"
                      className="aspect-[3/2] w-full bg-subtle object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex aspect-[3/2] w-full items-center justify-center text-7xl font-semibold"
                      style={{ background: swatch.bg, color: swatch.fg }}
                    >
                      Aa
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-ink">{theme.name}</h3>
                      <div className="flex shrink-0 gap-1">
                        <Badge tone={isActive ? "success" : "neutral"}>
                          {isActive ? T("themes.cardActive") : T("themes.cardInactive")}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-ink-2">{theme.description}</p>
                    {extras.length > 0 ? (
                      <p className="text-xs text-ink-2">
                        {T("themes.extraTemplates", { list: extras.join(", ") })}
                      </p>
                    ) : null}
                    <p className="text-xs text-ink-3">
                      {T("themes.versionAuthor", {
                        version: theme.version,
                        author: theme.author || theme.id,
                      })}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                      {isActive ? (
                        <>
                          <Link
                            className="rounded-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle"
                            href={`/admin/themes/${theme.id}`}
                          >
                            {T("themes.customize")}
                          </Link>
                          {rollbackTarget && canManage ? (
                            <ConfirmForm
                              action={rollbackThemeAction}
                              message={T("themes.rollbackConfirm", { theme: rollbackTarget })}
                              fields={{}}
                            >
                              <button className="rounded-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle">
                                {T("themes.rollback", { theme: rollbackTarget })}
                              </button>
                            </ConfirmForm>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {previewToken ? (
                            <a
                              className="rounded-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle"
                              href={`/preview/${theme.id}?t=${previewToken}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {T("themes.preview")}
                            </a>
                          ) : null}
                          {canManage ? (
                            <ConfirmForm
                              action={activateThemeAction}
                              message={T("themes.activateConfirm", { name: theme.name })}
                              fields={{ themeId: theme.id }}
                            >
                              <Button>{T("themes.activate")}</Button>
                            </ConfirmForm>
                          ) : null}
                          <Link
                            className="rounded-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle"
                            href={`/admin/themes/${theme.id}`}
                          >
                            {T("themes.detail.open")}
                          </Link>
                        </>
                      )}
                      {canManage && !blocked ? (
                        <ConfirmForm
                          action={uninstallThemeAction}
                          message={T("themes.uninstallConfirm", { name: theme.name })}
                          fields={{ themeId: theme.id }}
                        >
                          <button className="ml-auto rounded-control px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50">
                            {T("themes.uninstall")}
                          </button>
                        </ConfirmForm>
                      ) : null}
                    </div>
                    {canManage && blocked && !isActive ? (
                      <p className="text-xs text-ink-3">{T(`themes.deleteBlocked.${blocked}`)}</p>
                    ) : null}
                  </div>
                </article>
              );
            })
        )}
      </div>

      {canManage ? (
        <Card className="mt-6">
          <h2 className="mb-1 font-semibold">{T("themes.uploadTitle")}</h2>
          <p className="mb-3 text-sm text-ink-2">{T("themes.uploadHint")}</p>
          <ThemeUploadForm
            labels={{ button: T("themes.uploadButton"), uploading: T("themes.uploading") }}
          />
        </Card>
      ) : null}

      <Card className="mt-6">
        <h2 className="text-base font-semibold text-ink">{T("themes.backups")}</h2>
        <p className="mb-3 mt-1 text-sm text-ink-2">{T("themes.backupsDesc")}</p>
        {backups.length === 0 ? (
          <p className="text-sm text-ink-3">{T("themes.backupNone")}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {backups.map((backup) => (
              <li
                key={backup.name}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <strong>{nameOf(backup.themeId)}</strong> · v{backup.version}{" "}
                  <span className="text-xs text-ink-3">
                    {T("themes.backupCreated", {
                      date: formatDate(backup.createdAt.toISOString(), locale),
                    })}
                  </span>
                </span>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    <ConfirmForm
                      action={restoreThemeBackupAction}
                      message={T("themes.backupRestoreConfirm", {
                        id: backup.themeId,
                        version: backup.version,
                      })}
                      fields={{ backup: backup.name }}
                    >
                      <Button variant="secondary">{T("themes.backupRestore")}</Button>
                    </ConfirmForm>
                    <ConfirmForm
                      action={deleteThemeBackupAction}
                      message={T("themes.backupDeleteConfirm", {
                        id: backup.themeId,
                        version: backup.version,
                      })}
                      fields={{ backup: backup.name, returnTo: "/admin/themes" }}
                    >
                      <Button variant="danger">{T("themes.backupDelete")}</Button>
                    </ConfirmForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6">
        <DataTable
          title={T("themes.history")}
          head={[
            T("themes.historyWhen"),
            T("themes.historyAction"),
            T("themes.historyTheme"),
            T("themes.historyDetail"),
          ]}
          empty={history.length === 0 ? T("themes.historyNone") : undefined}
        >
          {history.map((h) => (
            <tr key={h.id} className={rowClass}>
              <td className={`${cellClass} whitespace-nowrap text-ink-2`}>
                {h.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </td>
              <td className={cellClass}>{h.action}</td>
              <td className={cellClass}>{h.toThemeId ?? h.themeId ?? T("common.never")}</td>
              <td className={`${cellClass} text-xs text-ink-3`}>{h.detail.slice(0, 120)}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}
