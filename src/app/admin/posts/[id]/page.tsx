import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, Flash, Button } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { PostActions, PostForm } from "@/components/admin/post-form";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { restoreRevisionAction } from "@/app/admin/actions/content";
import { formatDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { availableCustomTemplates } from "@/lib/themes/templates";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const flash = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      categories: true,
      tags: true,
      revisions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!post) notFound();
  // Authors can only open their own posts. Other posts are reported as not found.
  if (user.role === "author" && post.authorId !== user.id) notFound();

  const [categories, tags, templates] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({
      // Tags of an inactive theme stay out of the list, unless this post already carries one.
      where: { OR: [{ hidden: false }, { posts: { some: { postId: id } } }] },
      orderBy: { name: "asc" },
    }),
    availableCustomTemplates("single-post"),
  ]);
  const canEdit = can(user.role, "content:write-any");
  const live = post.status === "published" && post.publishedAt && post.publishedAt <= new Date();
  return (
    <>
      <PageHeader
        title={T("compose.title")}
        description={T("posts.publicAddress", { slug: post.slug })}
        action={
          <>
            {live ? (
              <a
                className="text-sm font-medium text-brand-600 hover:underline"
                href={`/posts/${post.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                {T("common.viewOnSite")}
              </a>
            ) : null}
            <PostActions status={post.status} canPublish={can(user.role, "content:publish")} />
          </>
        }
      />
      <Flash ok={flash.ok} error={flash.error} />
      <PostForm
        templates={templates}
        post={post}
        categories={categories}
        tags={tags}
        canPublish={can(user.role, "content:publish")}
        canFeature={can(user.role, "content:publish")}
        selectedCategoryIds={post.categories.map((c) => c.categoryId)}
        selectedTagIds={post.tags.map((x) => x.tagId)}
      />
      <Card className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-ink">{T("posts.revisions")}</h2>
        {post.revisions.length === 0 ? (
          <p className="text-sm text-ink-3">{T("posts.noRevisions")}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {post.revisions.map((rev) => (
              <li key={rev.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {formatDate(rev.createdAt.toISOString(), locale)} ·{" "}
                  <span className="font-medium">{rev.title}</span>
                </span>
                {canEdit ? (
                  <ConfirmForm
                    action={restoreRevisionAction}
                    message={T("posts.restoreConfirm")}
                    fields={{ postId: post.id, revisionId: rev.id }}
                  >
                    <Button variant="secondary">{T("posts.restore")}</Button>
                  </ConfirmForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
