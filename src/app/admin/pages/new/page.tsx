import { Flash } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { PageForm } from "@/components/admin/page-form";
import { availableCustomTemplates } from "@/lib/themes/templates";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const T = tr(await getLocale());
  const templates = await availableCustomTemplates("page");
  return (
    <>
      <PageHeader title={T("pages.newTitle")} />
      <Flash error={params.error} />
      <PageForm templates={templates} />
    </>
  );
}
