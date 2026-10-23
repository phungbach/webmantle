import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DesignerPage } from "@/components/admin/designer/designer-page";

export const dynamic = "force-dynamic";

export default async function PageDesign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await prisma.page.findUnique({ where: { id }, select: { isHome: true } });
  // The home page is designed on the home template, so it uses the home designer.
  if (page?.isHome) redirect("/admin/design/home");
  return <DesignerPage target={{ kind: "page", id }} />;
}
