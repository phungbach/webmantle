import { intlLocale } from "@/lib/i18n";

// All stored timestamps are UTC. Display uses SITE_TIMEZONE (default UTC) so every page shows the same date.
const TIME_ZONE = process.env.SITE_TIMEZONE || "UTC";

export function formatDate(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDateTimeInput(date: Date | null): string {
  if (!date) return "";
  // datetime-local input value in UTC; the admin form documents that times are UTC.
  return date.toISOString().slice(0, 16);
}

function zoned(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

/** Short date for tables: "12 thg 9" in Vietnamese, "Sep 12" in English. */
export function formatShortDate(date: Date, locale?: string): string {
  const z = zoned(date);
  if (locale === "vi") return `${z.d} thg ${z.m}`;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** Relative day plus time: "Hôm nay, 09:12", "Hôm qua, 17:40", otherwise "18 thg 10, 17:40". */
export function formatWhen(date: Date, locale?: string, now: Date = new Date()): string {
  const z = zoned(date);
  const n = zoned(now);
  const time = `${String(z.hh).padStart(2, "0")}:${String(z.mm).padStart(2, "0")}`;
  const dayNumber = (v: { y: number; m: number; d: number }) =>
    Date.UTC(v.y, v.m - 1, v.d) / 86_400_000;
  const diff = dayNumber(n) - dayNumber(z);
  const vi = locale === "vi";
  if (diff === 0) return `${vi ? "Hôm nay" : "Today"}, ${time}`;
  if (diff === 1) return `${vi ? "Hôm qua" : "Yesterday"}, ${time}`;
  return `${formatShortDate(date, locale)}, ${time}`;
}
