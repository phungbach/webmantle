import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The page now lives in the settings hub. Old links and bookmarks keep working. */
export default async function LegacyappearancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = new URLSearchParams({ tab: "appearance" });
  for (const key of ["ok", "error", "q", "filter"]) {
    const value = Array.isArray(raw[key]) ? raw[key]?.[0] : raw[key];
    if (value) query.set(key, value);
  }
  redirect(`/admin/settings?${query.toString()}`);
}
