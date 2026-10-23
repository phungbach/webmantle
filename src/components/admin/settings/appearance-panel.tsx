import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import {
  getSiteBranding,
  PALETTES,
  type PaletteId,
  SEASONS,
  MOTIONS,
  H1_MODES,
} from "@/lib/appearance";
import { Button, Card, Flash } from "@/components/admin/ui";
import { PanelHeading } from "@/components/admin/settings/panel-heading";
import {
  resetMenuAction,
  saveAppearanceAction,
  saveMenuAction,
} from "@/app/admin/actions/appearance";
import { getSiteMenu, MENU_ROWS, menuToRows } from "@/lib/menu";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { MenuEditor, type MenuTargetGroup } from "@/components/admin/menu-row";
import { prisma } from "@/lib/db";

const PALETTE_KEYS: Record<
  PaletteId,
  | "appearance.paletteTheme"
  | "appearance.paletteIndigo"
  | "appearance.paletteGreen"
  | "appearance.paletteRed"
  | "appearance.paletteOrange"
  | "appearance.paletteSlate"
> = {
  theme: "appearance.paletteTheme",
  indigo: "appearance.paletteIndigo",
  green: "appearance.paletteGreen",
  red: "appearance.paletteRed",
  orange: "appearance.paletteOrange",
  slate: "appearance.paletteSlate",
};
const SEASON_KEYS = {
  off: "appearance.seasonOff",
  auto: "appearance.seasonAuto",
  spring: "appearance.seasonSpring",
  summer: "appearance.seasonSummer",
  autumn: "appearance.seasonAutumn",
  winter: "appearance.seasonWinter",
} as const;

/** Site-wide look: colour set, heading colour, seasonal decoration, security guard and menu. */
export async function AppearancePanel({ params }: { params: Record<string, string | undefined> }) {
  const locale = await getLocale();
  const T = tr(locale);
  const [{ appearance }, menu] = await Promise.all([getSiteBranding(), getSiteMenu()]);
  const menuRows = menuToRows(menu);
  // Pages that exist now: the fixed site pages, every published page, and every category.
  const [pages, categories] = await Promise.all([
    prisma.page.findMany({
      where: { status: "published" },
      orderBy: { title: "asc" },
      select: { title: true, slug: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
  ]);
  const menuGroups: MenuTargetGroup[] = [
    {
      label: T("appearance.menuGroupPages"),
      options: [
        { label: T("nav.home"), href: "/" },
        { label: T("nav.search"), href: "/search" },
        ...pages.map((p) => ({ label: p.title, href: `/pages/${p.slug}` })),
      ],
    },
    {
      label: T("appearance.menuGroupCategories"),
      options: categories.map((c) => ({ label: c.name, href: `/categories/${c.slug}` })),
    },
  ].filter((g) => g.options.length > 0);

  // The highlight follows the radio button itself (:checked), so it moves as soon as a choice is made,
  // not only after saving.
  const card =
    "cursor-pointer rounded-lg border border-line p-3 text-left text-sm transition hover:border-line-strong has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600";

  return (
    <>
      <PanelHeading title={T("appearance.title")} description={T("appearance.description")} />
      <Flash ok={params.ok} error={params.error} />

      <Card className="max-w-3xl space-y-7">
        <form action={saveAppearanceAction} className="space-y-7">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-2">
              {T("appearance.palette")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(PALETTES) as PaletteId[]).map((id) => {
                const p = PALETTES[id];
                return (
                  <label key={id} className={`${card} flex items-center gap-3`}>
                    <input
                      type="radio"
                      name="palette"
                      value={id}
                      defaultChecked={appearance.palette === id}
                      className="sr-only"
                    />
                    <span
                      className="h-8 w-8 shrink-0 rounded-control border border-line"
                      style={{
                        background: p.accent
                          ? `linear-gradient(90deg, ${p.soft} 50%, ${p.accent} 50%)`
                          : "repeating-linear-gradient(45deg,#e2e8f0 0 6px,#f8fafc 6px 12px)",
                      }}
                      aria-hidden="true"
                    />
                    <span>{T(PALETTE_KEYS[id])}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-ink-2">
              {T("appearance.security")}
            </legend>
            <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
              <input
                type="checkbox"
                name="blockDevtools"
                defaultChecked={appearance.blockDevtools}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">{T("appearance.devtools")}</span>
                <span className="text-xs text-ink-3">{T("appearance.devtoolsHint")}</span>
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">{T("appearance.h1")}</legend>
            <p className="mb-2 text-xs text-ink-3">{T("appearance.h1Hint")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {H1_MODES.map((mode) => {
                const labelKey =
                  mode === "theme"
                    ? "appearance.h1Theme"
                    : mode === "custom"
                      ? "appearance.h1Custom"
                      : "appearance.h1Default";
                return (
                  <label key={mode} className={card}>
                    <input
                      type="radio"
                      name="h1Mode"
                      value={mode}
                      defaultChecked={appearance.h1Mode === mode}
                      className="mr-2"
                    />
                    {T(labelKey)}
                  </label>
                );
              })}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-ink-2">{T("appearance.h1Color")}</span>
              <input
                type="color"
                name="h1Color"
                defaultValue={appearance.h1Color}
                className="h-9 w-16 cursor-pointer rounded border border-line-strong"
              />
              <span className="text-xs text-ink-3">{T("appearance.h1ColorHint")}</span>
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">
              {T("appearance.season")}
            </legend>
            <p className="mb-2 text-xs text-ink-3">{T("appearance.seasonHint")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {SEASONS.map((season) => (
                <label key={season} className={card}>
                  <input
                    type="radio"
                    name="season"
                    value={season}
                    defaultChecked={appearance.season === season}
                    className="mr-2"
                  />
                  {T(SEASON_KEYS[season])}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">
              {T("appearance.motion")}
            </legend>
            <p className="mb-2 text-xs text-ink-3">{T("appearance.motionHint")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {MOTIONS.map((motion) => (
                <label key={motion} className={card}>
                  <input
                    type="radio"
                    name="motion"
                    value={motion}
                    defaultChecked={appearance.motion === motion}
                    className="mr-2"
                  />
                  {T(motion === "on" ? "appearance.motionOn" : "appearance.motionOff")}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Button>{T("appearance.save")}</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6 max-w-3xl space-y-4">
        <h2 className="text-base font-semibold text-ink">{T("appearance.menu")}</h2>
        <p className="text-sm text-ink-2">{T("appearance.menuHint")}</p>
        <MenuEditor
          action={saveMenuAction}
          initialRows={menuRows}
          groups={menuGroups}
          max={MENU_ROWS}
          texts={{
            label: T("appearance.menuLabel"),
            href: T("appearance.menuHref"),
            level: T("appearance.menuLevel"),
            top: T("appearance.menuTop"),
            childLabel: T("appearance.menuChild"),
            pick: T("appearance.menuPick"),
            add: T("appearance.menuAdd"),
            remove: T("appearance.menuRemove"),
            save: T("appearance.menuSave"),
          }}
        />
        {menu.length > 0 ? (
          <ConfirmForm
            action={resetMenuAction}
            message={T("appearance.menuResetConfirm")}
            fields={{}}
          >
            <button className="text-sm text-ink-2 underline">{T("appearance.menuReset")}</button>
          </ConfirmForm>
        ) : null}
      </Card>
    </>
  );
}
