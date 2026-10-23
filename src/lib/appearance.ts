import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSiteSetting } from "@/lib/settings";
import { ValidationError } from "@/lib/errors";

/**
 * Site-wide appearance: colour set, heading colour, seasonal decoration, logo and the developer-tools
 * guard. They apply on top of whichever theme is active. Values are stored as strings in
 * SiteSetting and validated against a closed list whenever they are read or written.
 */

export const PALETTES = {
  theme: { label: "theme", accent: null, soft: null },
  indigo: { label: "indigo", accent: "#4f46e5", soft: "#e0e7ff" },
  green: { label: "green", accent: "#059669", soft: "#d1fae5" },
  red: { label: "red", accent: "#e11d48", soft: "#ffe4e6" },
  orange: { label: "orange", accent: "#d97706", soft: "#fef3c7" },
  slate: { label: "slate", accent: "#334155", soft: "#e2e8f0" },
} as const;
export type PaletteId = keyof typeof PALETTES;

export const H1_MODES = ["theme", "custom", "default"] as const;
export type H1Mode = (typeof H1_MODES)[number];
export const DEFAULT_H1_COLOR = "#111827";

export const SEASONS = ["off", "auto", "spring", "summer", "autumn", "winter"] as const;
export type SeasonId = (typeof SEASONS)[number];

/** Site-wide animations (see motion.ts): on by default, off for a completely still site. */
export const MOTIONS = ["on", "off"] as const;
export type MotionId = (typeof MOTIONS)[number];

export type Appearance = {
  palette: PaletteId;
  h1Mode: H1Mode;
  h1Color: string;
  season: SeasonId;
  motion: MotionId;
  blockDevtools: boolean;
  logoMediaId: string;
};

export const APPEARANCE_DEFAULTS: Appearance = {
  palette: "theme",
  h1Mode: "theme",
  h1Color: DEFAULT_H1_COLOR,
  season: "off",
  motion: "on",
  blockDevtools: false,
  logoMediaId: "",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export const appearanceSchema = z.object({
  palette: z.enum(Object.keys(PALETTES) as [PaletteId, ...PaletteId[]]),
  h1Mode: z.enum(H1_MODES),
  h1Color: z.string().regex(HEX, "Use a 6-digit colour, for example #111827"),
  season: z.enum(SEASONS),
  motion: z.enum(MOTIONS).default("on"),
  blockDevtools: z.boolean(),
});

/** Reads the stored values. Anything missing or unknown falls back to the default. */
export async function getAppearance(): Promise<Appearance> {
  const rows = await prisma.siteSetting.findMany({
    where: {
      key: {
        in: ["palette", "h1Mode", "h1Color", "season", "motion", "blockDevtools", "logoMediaId"],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = map.get(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  };
  return {
    palette: pick("palette", Object.keys(PALETTES) as PaletteId[], APPEARANCE_DEFAULTS.palette),
    h1Mode: pick("h1Mode", H1_MODES, APPEARANCE_DEFAULTS.h1Mode),
    h1Color: HEX.test(map.get("h1Color") ?? "") ? map.get("h1Color")! : DEFAULT_H1_COLOR,
    season: pick("season", SEASONS, APPEARANCE_DEFAULTS.season),
    motion: pick("motion", MOTIONS, APPEARANCE_DEFAULTS.motion),
    blockDevtools: map.get("blockDevtools") === "on",
    logoMediaId: /^[a-z0-9]{10,40}$/.test(map.get("logoMediaId") ?? "")
      ? map.get("logoMediaId")!
      : "",
  };
}

export async function saveAppearance(input: unknown) {
  const parsed = appearanceSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid appearance settings.");
  const v = parsed.data;
  await setSiteSetting("palette", v.palette);
  await setSiteSetting("h1Mode", v.h1Mode);
  await setSiteSetting("h1Color", v.h1Color.toLowerCase());
  await setSiteSetting("season", v.season);
  await setSiteSetting("motion", v.motion);
  await setSiteSetting("blockDevtools", v.blockDevtools ? "on" : "off");
}

export async function setLogoMedia(id: string) {
  await setSiteSetting("logoMediaId", id);
}

/** Month-based season, used when the season is set to "auto". Northern hemisphere, UTC month. */
export function seasonForMonth(month: number): Exclude<SeasonId, "off" | "auto"> {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function activeSeason(
  season: SeasonId,
  now = new Date()
): Exclude<SeasonId, "off" | "auto"> | null {
  if (season === "off") return null;
  if (season === "auto") return seasonForMonth(now.getUTCMonth() + 1);
  return season;
}

/**
 * CSS that overrides the active theme's colours. Only values from the fixed palette and validated
 * hex colours are written, so nothing from the database can break out of the declaration.
 */
export function appearanceCss(a: Appearance): string {
  const parts: string[] = [];
  const palette = PALETTES[a.palette];
  if (palette.accent) {
    parts.push(`--color-accent:${palette.accent};--color-accent-soft:${palette.soft};`);
  }
  const h1 =
    a.h1Mode === "theme"
      ? "var(--color-accent, currentColor)"
      : a.h1Mode === "custom"
        ? a.h1Color
        : DEFAULT_H1_COLOR;
  return `:root{${parts.join("")}}.cms-theme-root h1{color:${h1};}`;
}

/** Appearance plus the logo address and id, as the public pages need them. */
export const getSiteBranding = cache(
  async (): Promise<{
    appearance: Appearance;
    logoUrl: string | null;
    logoId: string | null;
  }> => {
    const appearance = await getAppearance();
    if (!appearance.logoMediaId) return { appearance, logoUrl: null, logoId: null };
    const media = await prisma.media.findUnique({
      where: { id: appearance.logoMediaId },
      select: { id: true },
    });
    return {
      appearance,
      logoUrl: media ? `/media/${media.id}` : null,
      logoId: media ? media.id : null,
    };
  }
);
