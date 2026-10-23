"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import {
  deleteCategory,
  deletePage,
  deletePost,
  deleteTag,
  createUser,
  deleteUser,
  restorePostRevision,
  savePage,
  savePost,
  saveCategory,
  saveTag,
} from "@/lib/content/mutations";
import { deleteMedia, saveMedia } from "@/lib/media";
import { setSiteSetting } from "@/lib/settings";
import { siteSettingsSchema } from "@/lib/validation/schemas";
import { fromZod } from "@/lib/errors";
import { slugify } from "@/lib/content/slug";
import { attempt, backWith, formString, tm } from "@/app/admin/actions/shared";
import { audit } from "@/lib/audit";

function refreshPublic() {
  revalidatePath("/", "layout");
}

// The header buttons of the editor send an intent; a plain submit (Enter key) keeps the current status.
const INTENT_STATUS: Record<string, string> = {
  draft: "draft",
  publish: "published",
  archive: "archived",
};

function statusFromForm(formData: FormData): string {
  return (
    INTENT_STATUS[formString(formData, "intent")] ?? (formString(formData, "status") || "draft")
  );
}

function postFormToInput(formData: FormData) {
  const title = formString(formData, "title");
  const slug = formString(formData, "slug").trim() || slugify(title);
  return {
    id: formString(formData, "id") || undefined,
    title,
    slug,
    excerpt: formString(formData, "excerpt"),
    body: formString(formData, "body"),
    status: statusFromForm(formData),
    template: formString(formData, "template"),
    fields: {
      type: formString(formData, "field_type"),
      area: formString(formData, "field_area"),
      schedule: formString(formData, "field_schedule"),
      price: formString(formData, "field_price"),
    },
    publishedAt: formString(formData, "publishedAt") || undefined,
    featured: formData.get("featured") === "on",
    categoryIds: formData.getAll("categoryIds").map(String),
    tagIds: formData.getAll("tagIds").map(String),
    seoTitle: formString(formData, "seoTitle"),
    seoDescription: formString(formData, "seoDescription"),
    focusKeyword: formString(formData, "focusKeyword"),
    canonicalUrl: formString(formData, "canonicalUrl"),
    robots: formString(formData, "robots") || "index",
    follow: formString(formData, "follow") || "follow",
    ogTitle: formString(formData, "ogTitle"),
    ogDescription: formString(formData, "ogDescription"),
    twitterCard: formString(formData, "twitterCard") || "summary_large_image",
    featuredImage: formString(formData, "featuredImage"),
    socialImage: formString(formData, "socialImage"),
    featuredImageAlt: formString(formData, "featuredImageAlt"),
  };
}

export async function savePostAction(formData: FormData) {
  const result = await attempt("save-post", async () =>
    savePost(await requirePermission("content:write-own"), postFormToInput(formData))
  );
  if (!result.ok)
    backWith(
      formString(formData, "id")
        ? `/admin/posts/${formString(formData, "id")}`
        : "/admin/posts/new",
      "error",
      result.message
    );
  refreshPublic();
  backWith(`/admin/posts/${result.value.id}`, "ok", await tm("flash.postSaved"));
}

export async function deletePostAction(formData: FormData) {
  const id = formString(formData, "id");
  const result = await attempt("delete-post", async () =>
    deletePost(await requirePermission("content:write-own"), id)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/posts", "error", result.message);
  backWith("/admin/posts", "ok", await tm("flash.postDeleted"));
}

export async function restoreRevisionAction(formData: FormData) {
  const postId = formString(formData, "postId");
  const revisionId = formString(formData, "revisionId");
  const result = await attempt("restore-revision", async () =>
    restorePostRevision(await requirePermission("content:write-any"), postId, revisionId)
  );
  refreshPublic();
  if (!result.ok) backWith(`/admin/posts/${postId}`, "error", result.message);
  backWith(`/admin/posts/${postId}`, "ok", await tm("flash.revisionRestored"));
}

function pageFormToInput(formData: FormData) {
  const title = formString(formData, "title");
  return {
    id: formString(formData, "id") || undefined,
    title,
    slug: formString(formData, "slug").trim() || slugify(title),
    body: formString(formData, "body"),
    status: formString(formData, "status") || "draft",
    template: formString(formData, "template"),
    seoTitle: formString(formData, "seoTitle"),
    seoDescription: formString(formData, "seoDescription"),
  };
}

export async function savePageAction(formData: FormData) {
  const result = await attempt("save-page", async () =>
    savePage(await requirePermission("content:write-any"), pageFormToInput(formData))
  );
  refreshPublic();
  if (!result.ok)
    backWith(
      formString(formData, "id")
        ? `/admin/pages/${formString(formData, "id")}`
        : "/admin/pages/new",
      "error",
      result.message
    );
  backWith(`/admin/pages/${result.value.id}`, "ok", await tm("flash.pageSaved"));
}

export async function deletePageAction(formData: FormData) {
  const id = formString(formData, "id");
  const result = await attempt("delete-page", async () =>
    deletePage(await requirePermission("content:write-any"), id)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/pages", "error", result.message);
  backWith("/admin/pages", "ok", await tm("flash.pageDeleted"));
}

export async function saveCategoryAction(formData: FormData) {
  const input = {
    id: formString(formData, "id") || undefined,
    name: formString(formData, "name"),
    slug: formString(formData, "slug").trim() || slugify(formString(formData, "name")),
    description: formString(formData, "description"),
    seoDescription: formString(formData, "seoDescription"),
  };
  const result = await attempt("save-category", async () =>
    saveCategory(await requirePermission("taxonomy:manage"), input)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/categories", "error", result.message);
  backWith("/admin/categories", "ok", await tm("flash.categorySaved"));
}

export async function deleteCategoryAction(formData: FormData) {
  const id = formString(formData, "id");
  const result = await attempt("delete-category", async () =>
    deleteCategory(await requirePermission("taxonomy:manage"), id)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/categories", "error", result.message);
  backWith("/admin/categories", "ok", await tm("flash.categoryDeleted"));
}

export async function saveTagAction(formData: FormData) {
  const name = formString(formData, "name");
  const input = {
    id: formString(formData, "id") || undefined,
    name,
    slug: formString(formData, "slug").trim() || slugify(name),
  };
  const result = await attempt("save-tag", async () =>
    saveTag(await requirePermission("taxonomy:manage"), input)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/categories", "error", result.message);
  backWith("/admin/categories", "ok", await tm("flash.tagSaved"));
}

export async function deleteTagAction(formData: FormData) {
  const id = formString(formData, "id");
  const result = await attempt("delete-tag", async () =>
    deleteTag(await requirePermission("taxonomy:manage"), id)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/categories", "error", result.message);
  backWith("/admin/categories", "ok", await tm("flash.tagDeleted"));
}

export async function uploadMediaAction(formData: FormData) {
  const file = formData.get("file");
  const alt = formString(formData, "altText");
  if (!(file instanceof File) || file.size === 0)
    backWith("/admin/media", "error", await tm("flash.chooseImage"));
  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const result = await attempt("upload-media", async () =>
    saveMedia(await requirePermission("media:upload"), buffer, alt)
  );
  if (!result.ok) backWith("/admin/media", "error", result.message);
  backWith("/admin/media", "ok", await tm("flash.imageUploaded"));
}

export async function deleteMediaAction(formData: FormData) {
  const id = formString(formData, "id");
  const result = await attempt("delete-media", async () =>
    deleteMedia(await requirePermission("media:upload"), id)
  );
  refreshPublic();
  if (!result.ok) backWith("/admin/media", "error", result.message);
  backWith("/admin/media", "ok", await tm("flash.imageDeleted"));
}

export async function saveSiteSettingsAction(formData: FormData) {
  const parsed = siteSettingsSchema.safeParse({
    siteTitle: formString(formData, "siteTitle"),
    siteDescription: formString(formData, "siteDescription"),
  });
  const result = await attempt("site-settings", async () => {
    const user = await requirePermission("settings:manage");
    if (!parsed.success) throw fromZod(parsed.error);
    await setSiteSetting("siteTitle", parsed.data.siteTitle);
    await setSiteSetting("siteDescription", parsed.data.siteDescription);
    await audit({
      actorId: user.id,
      action: "settings.site",
      targetType: "setting",
      targetId: "site",
    });
  });
  refreshPublic();
  if (!result.ok) backWith("/admin/settings", "error", result.message);
  backWith("/admin/settings", "ok", await tm("flash.siteSaved"));
}

export async function createUserAction(formData: FormData) {
  const result = await attempt("create-user", async () =>
    createUser(await requirePermission("users:manage"), {
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      role: formString(formData, "role"),
      password: formString(formData, "password"),
    })
  );
  if (!result.ok) backWith("/admin/users", "error", result.message);
  backWith("/admin/users", "ok", await tm("flash.userCreated"));
}

export async function deleteUserAction(formData: FormData) {
  const id = formString(formData, "id");
  const result = await attempt("delete-user", async () =>
    deleteUser(await requirePermission("users:manage"), id)
  );
  if (!result.ok) backWith("/admin/users", "error", result.message);
  backWith("/admin/users", "ok", await tm("flash.userDeleted"));
}
