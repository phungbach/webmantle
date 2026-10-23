import { assertTemplateAvailable } from "@/lib/themes/templates";
import { serializeFields } from "@/lib/content/fields";
import { applyFilter, runAction } from "@/lib/plugins/runtime";
import { prisma } from "@/lib/db";
import { audit, changedFields } from "@/lib/audit";
import { assertPermission, ForbiddenError, type CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ValidationError, fromZod } from "@/lib/errors";
import { sanitizeRichText, stripToText } from "@/lib/security/sanitize";
import { hashPassword } from "@/lib/auth/password";
import {
  pageSchema,
  postSchema,
  taxonomySchema,
  userSchema,
  type PostInput,
  type PageInput,
  type TaxonomyInput,
} from "@/lib/validation/schemas";

async function assertSlugFree(
  model: "post" | "page" | "category" | "tag",
  slug: string,
  ignoreId?: string
) {
  const existing = await (
    prisma[model] as unknown as {
      findUnique: (a: { where: { slug: string } }) => Promise<{ id: string } | null>;
    }
  ).findUnique({ where: { slug } });
  if (existing && existing.id !== ignoreId)
    throw new ValidationError(`The slug “${slug}” is already in use.`, { slug: "Already in use" });
}

function sameIds(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function parsePublishDate(value: string | undefined, fallback: Date | null): Date | null {
  if (!value) return fallback;
  const date = new Date(value.length === 16 ? `${value}:00Z` : value); // datetime-local values are UTC
  if (Number.isNaN(date.getTime()))
    throw new ValidationError("Publish date is not a valid date.", { publishedAt: "Invalid date" });
  return date;
}

// ---------- Posts ----------

export async function savePost(
  user: CurrentUser,
  raw: unknown
): Promise<{ id: string; slug: string }> {
  assertPermission(user, "content:write-own");
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  // Plugins may change the post. The result is validated again, so a plugin cannot save invalid data.
  const filtered = await applyFilter("post.beforeSave", parsed.data);
  const rechecked = postSchema.safeParse(filtered);
  if (!rechecked.success)
    throw new ValidationError("A plugin returned post data that is not valid.");
  const input: PostInput = rechecked.data;
  const existing = input.id ? await prisma.post.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new ValidationError("That post does not exist.");
  if (existing && user.role === "author" && existing.authorId !== user.id)
    throw new ForbiddenError("Authors can only edit their own posts.");

  const canPublish = can(user.role, "content:publish");
  if (input.status !== "draft" && !canPublish) {
    throw new ForbiddenError("Authors can save drafts. An editor or admin must publish.");
  }
  await assertSlugFree("post", input.slug, input.id);
  await assertTaxonomyIds(input.categoryIds, input.tagIds);
  await assertTemplateAvailable(input.template, "single-post");

  const body = sanitizeRichText(input.body);
  const excerpt = input.excerpt || stripToText(body, 200);
  const publishedAt =
    input.status === "published"
      ? parsePublishDate(input.publishedAt, existing?.publishedAt ?? new Date())
      : null;
  const featured = canPublish ? input.featured : false;
  await assertMediaExists([input.featuredImage, input.socialImage]);

  // Advanced SEO controls (indexing, canonical, share image, card type) are for editors and admins.
  // Authors keep whatever the post already has, or the defaults for a new post.
  const advanced = canPublish;
  const data = {
    title: input.title,
    slug: input.slug,
    excerpt,
    body,
    status: input.status,
    template: input.template,
    fields: serializeFields(input.fields),
    publishedAt,
    featured,
    featuredImage: input.featuredImage || null,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    focusKeyword: input.focusKeyword,
    canonicalUrl: advanced ? input.canonicalUrl : (existing?.canonicalUrl ?? ""),
    robotsIndex: advanced ? input.robots === "index" : (existing?.robotsIndex ?? true),
    robotsFollow: advanced ? input.follow === "follow" : (existing?.robotsFollow ?? true),
    socialImage: advanced ? input.socialImage || null : (existing?.socialImage ?? null),
    twitterCard: advanced ? input.twitterCard : (existing?.twitterCard ?? "summary_large_image"),
    ogTitle: input.ogTitle,
    ogDescription: input.ogDescription,
  };
  if (input.featuredImage && input.featuredImageAlt) {
    // The alt text belongs to the image in the library, so it is saved there.
    await prisma.media.update({
      where: { id: input.featuredImage },
      data: { altText: input.featuredImageAlt },
    });
  }

  const previousTaxonomy = existing
    ? await prisma.post
        .findUnique({
          where: { id: existing.id },
          select: {
            categories: { select: { categoryId: true } },
            tags: { select: { tagId: true } },
          },
        })
        .then(
          (p) =>
            p && {
              categories: p.categories.map((c) => c.categoryId),
              tags: p.tags.map((t) => t.tagId),
            }
        )
    : null;

  const saved = await prisma.$transaction(async (tx) => {
    if (existing) {
      // Keep the previous version so an edit can always be undone.
      await tx.postRevision.create({
        data: {
          postId: existing.id,
          title: existing.title,
          excerpt: existing.excerpt,
          body: existing.body,
          editorId: user.id,
        },
      });
      await tx.postCategory.deleteMany({ where: { postId: existing.id } });
      await tx.postTag.deleteMany({ where: { postId: existing.id } });
      return tx.post.update({
        where: { id: existing.id },
        data: {
          ...data,
          categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        },
      });
    }
    return tx.post.create({
      data: {
        ...data,
        authorId: user.id,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
    });
  });

  const detail: Record<string, unknown> = { slug: saved.slug, status: saved.status };
  if (existing) {
    const changed = changedFields(existing, data);
    if (!sameIds(previousTaxonomy?.categories ?? [], input.categoryIds)) changed.push("categories");
    if (!sameIds(previousTaxonomy?.tags ?? [], input.tagIds)) changed.push("tags");
    detail.changed = changed;
    if (existing.status !== saved.status) detail.statusChange = [existing.status, saved.status];
  }
  await audit({
    actorId: user.id,
    action: existing ? "post.update" : "post.create",
    targetType: "post",
    targetId: saved.id,
    detail,
  });
  // Publishing and unpublishing are logged on their own so they are easy to find.
  const wasPublished = existing?.status === "published";
  if (saved.status === "published" && !wasPublished)
    await audit({
      actorId: user.id,
      action: "post.publish",
      targetType: "post",
      targetId: saved.id,
      detail: { slug: saved.slug },
    });
  else if (saved.status !== "published" && wasPublished)
    await audit({
      actorId: user.id,
      action: "post.unpublish",
      targetType: "post",
      targetId: saved.id,
      detail: { slug: saved.slug, status: saved.status },
    });
  await runAction("post.saved", { id: saved.id, slug: saved.slug, status: saved.status });
  return { id: saved.id, slug: saved.slug };
}

export async function deletePost(user: CurrentUser, id: string) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw new ValidationError("That post does not exist.");
  if (user.role === "author") {
    assertPermission(user, "content:write-own");
    if (post.authorId !== user.id)
      throw new ForbiddenError("Authors can only delete their own posts.");
  } else {
    assertPermission(user, "content:write-any");
  }
  await prisma.post.delete({ where: { id } });
  await audit({
    actorId: user.id,
    action: "post.delete",
    targetType: "post",
    targetId: id,
    detail: { slug: post.slug },
  });
}

export async function restorePostRevision(user: CurrentUser, postId: string, revisionId: string) {
  assertPermission(user, "content:write-any");
  const revision = await prisma.postRevision.findFirst({ where: { id: revisionId, postId } });
  if (!revision) throw new ValidationError("That revision does not exist.");
  const current = await prisma.post.findUnique({ where: { id: postId } });
  if (!current) throw new ValidationError("That post does not exist.");
  await prisma.$transaction([
    prisma.postRevision.create({
      data: {
        postId,
        title: current.title,
        excerpt: current.excerpt,
        body: current.body,
        editorId: user.id,
      },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { title: revision.title, excerpt: revision.excerpt, body: revision.body },
    }),
  ]);
  await audit({
    actorId: user.id,
    action: "post.restore-revision",
    targetType: "post",
    targetId: postId,
    detail: { revisionId },
  });
}

/** Every media id sent with a post must exist. Empty values are skipped. */
async function assertMediaExists(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  const count = await prisma.media.count({ where: { id: { in: unique } } });
  if (count !== unique.length) throw new ValidationError("The selected image no longer exists.");
}

async function assertTaxonomyIds(categoryIds: string[], tagIds: string[]) {
  if (categoryIds.length) {
    const count = await prisma.category.count({ where: { id: { in: categoryIds } } });
    if (count !== new Set(categoryIds).size)
      throw new ValidationError("One of the selected categories does not exist.");
  }
  if (tagIds.length) {
    const count = await prisma.tag.count({ where: { id: { in: tagIds } } });
    if (count !== new Set(tagIds).size)
      throw new ValidationError("One of the selected tags does not exist.");
  }
}

// ---------- Pages ----------

export async function savePage(
  user: CurrentUser,
  raw: unknown
): Promise<{ id: string; slug: string }> {
  assertPermission(user, "content:write-any");
  const parsed = pageSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input: PageInput = parsed.data;
  if (input.status !== "draft") assertPermission(user, "content:publish");
  await assertSlugFree("page", input.slug, input.id);
  await assertTemplateAvailable(input.template, "page");
  const data = {
    title: input.title,
    slug: input.slug,
    body: sanitizeRichText(input.body),
    status: input.status,
    template: input.template,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };
  const before = input.id ? await prisma.page.findUnique({ where: { id: input.id } }) : null;
  const saved = input.id
    ? await prisma.page.update({ where: { id: input.id }, data })
    : await prisma.page.create({ data: { ...data, authorId: user.id } });
  await audit({
    actorId: user.id,
    action: input.id ? "page.update" : "page.create",
    targetType: "page",
    targetId: saved.id,
    detail: {
      slug: saved.slug,
      status: saved.status,
      ...(before ? { changed: changedFields(before, data) } : {}),
      ...(before && before.status !== saved.status
        ? { statusChange: [before.status, saved.status] }
        : {}),
    },
  });
  return { id: saved.id, slug: saved.slug };
}

export async function deletePage(user: CurrentUser, id: string) {
  assertPermission(user, "content:write-any");
  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) throw new ValidationError("That page does not exist.");
  await prisma.page.delete({ where: { id } });
  await audit({
    actorId: user.id,
    action: "page.delete",
    targetType: "page",
    targetId: id,
    detail: { slug: page.slug },
  });
}

// ---------- Categories and tags ----------

export async function saveCategory(user: CurrentUser, raw: unknown): Promise<string> {
  assertPermission(user, "taxonomy:manage");
  const parsed = taxonomySchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input: TaxonomyInput = parsed.data;
  await assertSlugFree("category", input.slug, input.id);
  const data = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    seoDescription: input.seoDescription,
  };
  const before = input.id ? await prisma.category.findUnique({ where: { id: input.id } }) : null;
  const saved = input.id
    ? await prisma.category.update({ where: { id: input.id }, data })
    : await prisma.category.create({ data });
  await audit({
    actorId: user.id,
    action: input.id ? "category.update" : "category.create",
    targetType: "category",
    targetId: saved.id,
    detail: { slug: saved.slug, ...(before ? { changed: changedFields(before, data) } : {}) },
  });
  return saved.id;
}

export async function deleteCategory(user: CurrentUser, id: string) {
  assertPermission(user, "taxonomy:manage");
  const count = await prisma.postCategory.count({ where: { categoryId: id } });
  // Deleting a category that posts still use would silently remove it from those posts. Refuse instead.
  if (count > 0)
    throw new ValidationError(
      `This category is used by ${count} post(s). Remove it from them first.`
    );
  await prisma.category.delete({ where: { id } });
  await audit({
    actorId: user.id,
    action: "category.delete",
    targetType: "category",
    targetId: id,
  });
}

export async function saveTag(user: CurrentUser, raw: unknown): Promise<string> {
  assertPermission(user, "taxonomy:manage");
  const parsed = taxonomySchema.pick({ id: true, name: true, slug: true }).safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  await assertSlugFree("tag", parsed.data.slug, parsed.data.id);
  const before = parsed.data.id
    ? await prisma.tag.findUnique({ where: { id: parsed.data.id } })
    : null;
  const saved = parsed.data.id
    ? await prisma.tag.update({
        where: { id: parsed.data.id },
        data: { name: parsed.data.name, slug: parsed.data.slug },
      })
    : await prisma.tag.create({ data: { name: parsed.data.name, slug: parsed.data.slug } });
  await audit({
    actorId: user.id,
    action: parsed.data.id ? "tag.update" : "tag.create",
    targetType: "tag",
    targetId: saved.id,
    detail: {
      slug: saved.slug,
      ...(before
        ? { changed: changedFields(before, { name: parsed.data.name, slug: parsed.data.slug }) }
        : {}),
    },
  });
  return saved.id;
}

export async function deleteTag(user: CurrentUser, id: string) {
  assertPermission(user, "taxonomy:manage");
  const count = await prisma.postTag.count({ where: { tagId: id } });
  if (count > 0)
    throw new ValidationError(`This tag is used by ${count} post(s). Remove it from them first.`);
  await prisma.tag.delete({ where: { id } });
  await audit({ actorId: user.id, action: "tag.delete", targetType: "tag", targetId: id });
}

// ---------- Users ----------

export async function createUser(actor: CurrentUser, raw: unknown) {
  assertPermission(actor, "users:manage");
  const parsed = userSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing)
    throw new ValidationError("A user with that email already exists.", {
      email: "Already in use",
    });
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  // The audit entry records the role, never the password.
  await audit({
    actorId: actor.id,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    detail: { role: user.role },
  });
  return user.id;
}

export async function deleteUser(actor: CurrentUser, id: string) {
  assertPermission(actor, "users:manage");
  if (actor.id === id) throw new ValidationError("You cannot delete your own account.");
  const target = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { posts: true, pages: true } } },
  });
  if (!target) throw new ValidationError("That user does not exist.");
  if (target._count.posts + target._count.pages > 0) {
    throw new ValidationError(
      "This user has posts or pages. Reassign or delete that content first."
    );
  }
  if (target.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins <= 1) throw new ValidationError("The last administrator cannot be deleted.");
  }
  await prisma.user.delete({ where: { id } });
  await audit({
    actorId: actor.id,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    detail: { role: target.role },
  });
}
