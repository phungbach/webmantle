import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { Button, Card, Field, Flash, TextArea } from "@/components/admin/ui";
import { PanelHeading } from "@/components/admin/settings/panel-heading";
import { saveSiteSettingsAction } from "@/app/admin/actions/content";
import { removeLogoAction } from "@/app/admin/actions/appearance";
import { LogoUploader } from "@/components/admin/logo-uploader";
import { getSiteBranding } from "@/lib/appearance";
import { SITE_URL } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export async function GeneralPanel({
  role,
  params,
}: {
  role: string;
  params: Record<string, string | undefined>;
}) {
  const locale = await getLocale();
  const T = tr(locale);
  const [settings, { logoUrl }] = await Promise.all([getSiteSettings(), getSiteBranding()]);
  return (
    <>
      <PanelHeading
        title={T("admin.nav.settings")}
        action={<Button form="settings-form">{T("settings.saveChanges")}</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-ink">{T("settings.cardInfo")}</h2>
          <form
            id="settings-form"
            action={saveSiteSettingsAction}
            className="grid gap-x-5 gap-y-4 sm:grid-cols-2"
          >
            <Field
              label={T("settings.siteTitle")}
              name="siteTitle"
              defaultValue={settings.siteTitle}
              required
              maxLength={120}
            />
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {T("settings.siteAddress")}
              </span>
              <input
                value={SITE_URL}
                readOnly
                aria-readonly="true"
                className="w-full cursor-default rounded-control border border-line-strong bg-canvas px-3 py-2 text-sm text-ink-2"
              />
              <span className="mt-1 block text-xs text-ink-3">{T("settings.siteAddressHint")}</span>
            </label>
            <div className="sm:col-span-2">
              <TextArea
                label={T("settings.siteDescription")}
                name="siteDescription"
                defaultValue={settings.siteDescription}
                rows={3}
                hint={T("settings.siteDescriptionHint")}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink">
                {T("settings.defaultLanguage")}
              </span>
              <select
                name="defaultLocale"
                defaultValue={settings.defaultLocale}
                className="w-full rounded-control border border-line-strong bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
              <span className="mt-1 block text-xs text-ink-3">
                {T("settings.defaultLanguageHint")}
              </span>
            </label>
          </form>
        </Card>
        <Card className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-ink">{T("appearance.logo")}</h2>
          <p className="text-sm text-ink-2">{T("appearance.logoHint")}</p>
          <LogoUploader
            currentUrl={logoUrl}
            labels={{
              choose: T("appearance.logoChoose"),
              none: T("appearance.logoNone"),
              upload: T("appearance.logoUpload"),
              uploading: T("appearance.logoUploading"),
              invalid: T("appearance.logoInvalid"),
              cropHint: T("appearance.logoCropHint"),
              zoom: T("appearance.logoZoom"),
              outputSize: T("appearance.logoOutputSize"),
              current: T("appearance.logoCurrent"),
            }}
          />
          {logoUrl ? (
            <form action={removeLogoAction}>
              <button className="text-sm text-danger-600 underline">
                {T("appearance.logoRemove")}
              </button>
            </form>
          ) : null}
        </Card>
        <div className="space-y-4 lg:col-start-3 lg:row-span-2 lg:row-start-1">
          <Card>
            <h2 className="text-base font-semibold text-ink">{T("settings.yourRole")}</h2>
            <p className="mt-2 text-sm text-ink-2">
              {T("settings.roleText", {
                role: T(`admin.role.${role}` as "admin.role.admin"),
              })}
            </p>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-ink">{T("builder.homeCardTitle")}</h2>
            <p className="mt-2 text-sm text-ink-2">{T("builder.homeCardText")}</p>
            <Link
              href="/admin/design/home"
              className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              {T("builder.designHome")}
            </Link>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-ink">{T("settings.backupTitle")}</h2>
            <p className="mt-2 text-sm text-ink-2">{T("settings.backupText")}</p>
          </Card>
          <Flash ok={params.ok} error={params.error} />
        </div>
      </div>
    </>
  );
}
