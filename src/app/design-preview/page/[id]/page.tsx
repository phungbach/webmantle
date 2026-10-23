import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ThemePage } from "@/components/theme/theme-page";
import { getActiveRequestTheme } from "@/lib/themes/request-theme";
import { requireDesigner, previewLayout } from "@/app/design-preview/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default async function PagePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { canEditContent } = await requireDesigner({ kind: "page", id });
  const [theme, page] = await Promise.all([
    getActiveRequestTheme(),
    prisma.page.findUnique({ where: { id } }),
  ]);
  if (!page) notFound();
  const layoutOverride = await previewLayout(theme.bundle, { kind: "page", id });
  return (
    <ThemePage
      bundle={theme.bundle}
      values={theme.values}
      ctx={{
        site: theme.site,
        edit: true,
        contentEdit: canEditContent,
        view: {
          kind: "page",
          templateId: page.template,
          title: page.title,
          page: {
            id: page.id,
            slug: page.slug,
            title: page.title,
            bodyHtml: page.body,
            seoTitle: page.seoTitle,
            seoDescription: page.seoDescription,
          },
          layoutOverride,
        },
      }}
    />
  );
}
