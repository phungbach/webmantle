import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Flash } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { PageForm } from "@/components/admin/page-form";
import { availableCustomTemplates } from "@/lib/themes/templates";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const T = tr(await getLocale());
  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) notFound();
  const templates = await availableCustomTemplates("page");
  return (
    <>
      <PageHeader
        title={T("pages.editTitle")}
        description={
          page.isHome ? T("pages.homeNotice") : T("pages.publicAddress", { slug: page.slug })
        }
        action={
          <Link
            href={page.isHome ? "/admin/design/home" : `/admin/pages/${page.id}/design`}
            className="inline-flex items-center rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {T("builder.designThisPage")}
          </Link>
        }
      />
      <Flash ok={flash.ok} error={flash.error} />
      {page.layout.trim() ? (
        <p
          role="status"
          className="mb-6 rounded-control border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-600"
        >
          {T("builder.layoutNotice")}
        </p>
      ) : null}
      <PageForm page={page} templates={templates} />
    </>
  );
}
