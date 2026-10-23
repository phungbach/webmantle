import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";

export const dynamic = "force-dynamic";

// Error pages are not indexed.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function NotFound() {
  const theme = await getActiveRequestTheme();
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        view: { kind: "not-found", title: t(theme.site.locale, "notFound.title") },
      }}
    />
  );
}
