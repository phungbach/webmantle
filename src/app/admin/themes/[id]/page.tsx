import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getThemeSettings } from "@/lib/themes/settings";
import { Badge, Button, Card, Field, Flash } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { CircleCheck } from "lucide-react";
import { Icon } from "@/components/admin/icon";
import {
  deleteThemeBackupAction,
  deleteThemeBackupsAction,
  restoreThemeBackupAction,
  saveThemeSettingsAction,
  uninstallThemeAction,
} from "@/app/admin/actions/themes";
import { getCurrentUser } from "@/lib/auth/session";
import { canView } from "@/lib/auth/permissions";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import type { SettingDefinition } from "@/lib/themes/contract";
import { validateThemeDirectory } from "@/lib/themes/validate";
import { createPreviewToken } from "@/lib/themes/preview-token";
import { listThemeBackups } from "@/lib/themes/backups";
import { deleteBlockReason } from "@/lib/themes/activate";
import { getSiteSettings } from "@/lib/settings";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Manifest = {
  version: string;
  author: string;
  description: string;
  minimumCmsVersion: string;
  supportedTemplates: string[];
  customTemplates: { id: string; label: string; description: string; appliesTo: string[] }[];
  requiredComponents: string[];
  tokens: Record<string, string>;
  settingsSchema: SettingDefinition[];
};

/**
 * One installed theme: what it provides, whether its files still pass the checks, its backups, and
 * its own settings. Editing settings here never changes another theme's values.
 */
export default async function ThemeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canView(user.role, "themes:manage")) notFound();
  const { id } = await params;
  const flash = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const theme = await prisma.theme.findUnique({ where: { id } });
  if (!theme) notFound();
  const manifest = JSON.parse(theme.manifestJson) as Manifest;
  const [values, settings, check] = await Promise.all([
    getThemeSettings(id, manifest.settingsSchema),
    getSiteSettings(),
    Promise.resolve(validateThemeDirectory(theme.path)),
  ]);
  const isActive = settings.activeThemeId === id;
  const backups = listThemeBackups(id);
  const blocked = await deleteBlockReason(id);
  const token = createPreviewToken(id);
  const coreTemplates = manifest.supportedTemplates.filter(
    (name) => !manifest.customTemplates.some((c) => c.id === name)
  );

  return (
    <>
      <Link
        href="/admin/themes"
        className="mb-3 inline-block text-sm font-medium text-ink-2 hover:text-ink hover:underline"
      >
        {T("themes.detail.back")}
      </Link>
      <PageHeader
        title={theme.name}
        description={`${theme.id} · v${theme.version}${manifest.author ? ` · ${manifest.author}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isActive ? <Badge tone="success">{T("themes.cardActive")}</Badge> : null}
            <a
              className="rounded-control border border-line-strong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
              href={`/preview/${id}?t=${token}`}
              target="_blank"
              rel="noreferrer"
            >
              {T("themes.detail.previewDesktop")}
            </a>
            <a
              className="rounded-control border border-line-strong bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
              href={`/preview/${id}?t=${token}&device=mobile`}
              target="_blank"
              rel="noreferrer"
            >
              {T("themes.detail.previewMobile")}
            </a>
          </div>
        }
      />
      <Flash ok={flash.ok} error={flash.error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-3 text-base font-semibold text-ink">{T("themes.detail.info")}</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <dt className="text-ink-3">{T("themes.detail.version")}</dt>
              <dd>{manifest.version}</dd>
              <dt className="text-ink-3">{T("themes.detail.minCms")}</dt>
              <dd>{manifest.minimumCmsVersion}</dd>
              <dt className="text-ink-3">{T("themes.detail.author")}</dt>
              <dd>{manifest.author || "—"}</dd>
              <dt className="text-ink-3">{T("themes.detail.installedOn")}</dt>
              <dd>{formatDate(theme.installedAt.toISOString(), locale)}</dd>
            </dl>
            {manifest.description ? (
              <p className="mt-3 text-sm text-ink-2">{manifest.description}</p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-ink">
              {T("themes.detail.templates")}
            </h2>
            <p className="mb-2 text-sm font-medium text-ink-2">
              {T("themes.detail.templatesCore")}
            </p>
            <ul className="mb-4 flex flex-wrap gap-2 text-sm">
              {coreTemplates.map((name) => (
                <li key={name} className="rounded-full bg-subtle px-3 py-1">
                  {name}
                </li>
              ))}
            </ul>
            {manifest.customTemplates.length > 0 ? (
              <>
                <p className="mb-2 text-sm font-medium text-ink-2">
                  {T("themes.detail.templatesCustom")}
                </p>
                <ul className="space-y-2 text-sm">
                  {manifest.customTemplates.map((tpl) => (
                    <li key={tpl.id} className="rounded-control border border-line p-3">
                      <p className="font-medium">
                        {tpl.label} <span className="text-xs text-ink-3">({tpl.id})</span>
                      </p>
                      <p className="text-ink-2">{tpl.description}</p>
                      <p className="text-xs text-ink-3">
                        {T("themes.detail.appliesTo", { kinds: tpl.appliesTo.join(", ") })}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-ink">{T("themes.detail.tokens")}</h2>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(manifest.tokens).map(([key, value]) => (
                <li key={key} className="flex items-center gap-2">
                  {/^#[0-9a-fA-F]{6}$/.test(value) ? (
                    <span
                      className="inline-block h-4 w-4 rounded border border-line-strong"
                      style={{ background: value }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <code className="text-xs">--{key}</code>
                  <span className="truncate text-xs text-ink-3">{value}</span>
                </li>
              ))}
            </ul>
            {manifest.requiredComponents.length > 0 ? (
              <>
                <p className="mb-2 mt-4 text-sm font-medium text-ink-2">
                  {T("themes.detail.components")}
                </p>
                <p className="text-xs text-ink-2">{manifest.requiredComponents.join(", ")}</p>
              </>
            ) : null}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">{T("themes.backups")}</h2>
              {backups.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {backups.length > 1 ? (
                    <ConfirmForm
                      action={deleteThemeBackupsAction}
                      message={T("themes.backupsDeleteOldConfirm", {
                        id,
                        count: backups.length - 1,
                      })}
                      fields={{ themeId: id, keep: "1", returnTo: `/admin/themes/${id}` }}
                    >
                      <Button variant="secondary">{T("themes.backupsDeleteOld")}</Button>
                    </ConfirmForm>
                  ) : null}
                  <ConfirmForm
                    action={deleteThemeBackupsAction}
                    message={T("themes.backupsDeleteAllConfirm", { id, count: backups.length })}
                    fields={{ themeId: id, keep: "0", returnTo: `/admin/themes/${id}` }}
                  >
                    <Button variant="danger">{T("themes.backupsDeleteAll")}</Button>
                  </ConfirmForm>
                </div>
              ) : null}
            </div>
            <p className="mb-3 text-sm text-ink-2">{T("themes.backupsDesc")}</p>
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
                      v{backup.version}{" "}
                      <span className="text-xs text-ink-3">
                        {T("themes.backupCreated", {
                          date: formatDate(backup.createdAt.toISOString(), locale),
                        })}
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <ConfirmForm
                        action={restoreThemeBackupAction}
                        message={T("themes.backupRestoreConfirm", { id, version: backup.version })}
                        fields={{ backup: backup.name }}
                      >
                        <Button variant="secondary">{T("themes.backupRestore")}</Button>
                      </ConfirmForm>
                      <ConfirmForm
                        action={deleteThemeBackupAction}
                        message={T("themes.backupDeleteConfirm", { id, version: backup.version })}
                        fields={{ backup: backup.name, returnTo: `/admin/themes/${id}` }}
                      >
                        <Button variant="danger">{T("themes.backupDelete")}</Button>
                      </ConfirmForm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-base font-semibold text-ink">
              {T("themes.detail.validation")}
            </h2>
            {check.ok ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success-600">
                <Icon icon={CircleCheck} className="h-4 w-4" />
                <span>{T("themes.detail.valid")}</span>
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-danger-600">
                  {T("themes.detail.invalid", { count: check.errors.length })}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-danger-600">
                  {check.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e.file ? `${e.file}: ${e.message}` : e.message}</li>
                  ))}
                </ul>
              </>
            )}
            {check.warnings.length > 0 ? (
              <>
                <p className="mt-3 text-sm font-medium text-warning-600">
                  {T("themes.detail.warnings")}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-warning-600">
                  {check.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-ink">
              {T("themes.detail.settingsHeading")}
            </h2>
            {manifest.settingsSchema.length === 0 ? (
              <p className="text-sm text-ink-3">{T("themes.noSettings")}</p>
            ) : (
              <form action={saveThemeSettingsAction} className="space-y-5">
                <input type="hidden" name="themeId" value={id} />
                {manifest.settingsSchema.map((def) => {
                  const current = values[def.key];
                  if (def.type === "boolean") {
                    return (
                      <label key={def.key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={def.key} defaultChecked={current === true} />{" "}
                        {def.label}
                      </label>
                    );
                  }
                  if (def.type === "select") {
                    return (
                      <label key={def.key} className="block">
                        <span className="mb-1 block text-sm font-medium text-ink-2">
                          {def.label}
                        </span>
                        <select
                          name={def.key}
                          defaultValue={String(current)}
                          className="w-full rounded-control border border-line-strong px-3 py-2 text-sm"
                        >
                          {def.options?.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  if (def.type === "color") {
                    return (
                      <label
                        key={def.key}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="font-medium text-ink-2">{def.label}</span>
                        <input
                          type="color"
                          name={def.key}
                          defaultValue={String(current)}
                          className="h-9 w-16 cursor-pointer rounded border border-line-strong"
                        />
                      </label>
                    );
                  }
                  return (
                    <Field
                      key={def.key}
                      label={def.label}
                      name={def.key}
                      defaultValue={String(current)}
                      maxLength={def.maxLength ?? 120}
                    />
                  );
                })}
                <Button>{T("themes.saveSettings")}</Button>
              </form>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-ink">{T("themes.uninstall")}</h2>
            {blocked ? (
              <p className="text-sm text-ink-2">{T(`themes.deleteBlocked.${blocked}`)}</p>
            ) : (
              <ConfirmForm
                action={uninstallThemeAction}
                message={T("themes.uninstallConfirm", { name: theme.name })}
                fields={{ themeId: id }}
              >
                <Button variant="danger">{T("themes.uninstall")}</Button>
              </ConfirmForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
