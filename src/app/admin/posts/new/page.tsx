import { redirect } from "next/navigation";
import { Flash } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { PostActions, PostForm } from "@/components/admin/post-form";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { availableCustomTemplates } from "@/lib/themes/templates";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const T = tr(await getLocale());
  const [categories, tags, templates] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: { hidden: false }, orderBy: { name: "asc" } }),
    availableCustomTemplates("single-post"),
  ]);
  return (
    <>
      <PageHeader
        title={T("compose.title")}
        action={<PostActions status="draft" canPublish={can(user.role, "content:publish")} />}
      />
      <Flash error={params.error} />
      <PostForm
        templates={templates}
        categories={categories}
        tags={tags}
        canPublish={can(user.role, "content:publish")}
        canFeature={can(user.role, "content:publish")}
        selectedCategoryIds={[]}
        selectedTagIds={[]}
      />
    </>
  );
}
