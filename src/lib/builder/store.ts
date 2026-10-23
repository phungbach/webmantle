import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getHomePage } from "@/lib/content/queries";
import { audit } from "@/lib/audit";
import { assertPermission, type CurrentUser } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import {
  assertMediaExists,
  pruneMissingMedia,
  parseLayout,
  validateLayoutInput,
  type LayoutDoc,
} from "@/lib/builder/schema";

export type LayoutTarget = { kind: "page"; id: string } | { kind: "home" };
export type LayoutState = { published: LayoutDoc | null; draft: LayoutDoc | null };

const HOME_PUBLISHED = "builder.home.layout";
const HOME_DRAFT = "builder.home.layoutDraft";

type Stored = { published: string; draft: string; slug: string | null; label: string };

function authorize(user: CurrentUser, target: LayoutTarget) {
  assertPermission(user, target.kind === "home" ? "settings:manage" : "content:write-any");
}

/**
 * Where a layout lives. The home layout is kept on the theme's home page when the theme brought one
 * (so it follows the theme), otherwise in the site settings.
 */
async function resolve(target: LayoutTarget): Promise<LayoutTarget | "settings"> {
  if (target.kind !== "home") return target;
  const home = await getHomePage();
  return home ? { kind: "page", id: home.id } : "settings";
}

async function read(requested: LayoutTarget): Promise<Stored> {
  const target = await resolve(requested);
  if (target === "settings") {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [HOME_PUBLISHED, HOME_DRAFT] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      published: map.get(HOME_PUBLISHED) ?? "",
      draft: map.get(HOME_DRAFT) ?? "",
      slug: null,
      label: "home",
    };
  }
  if (target.kind !== "page") throw new Error("unreachable");
  const page = await prisma.page.findUnique({
    where: { id: target.id },
    select: { layout: true, layoutDraft: true, slug: true, id: true },
  });
  if (!page) throw new ValidationError("That page does not exist.");
  return { published: page.layout, draft: page.layoutDraft, slug: page.slug, label: page.id };
}

async function write(requested: LayoutTarget, values: { published?: string; draft?: string }) {
  const target = await resolve(requested);
  if (target !== "settings" && target.kind === "page") {
    await prisma.page.update({
      where: { id: target.id },
      data: {
        ...(values.published !== undefined ? { layout: values.published } : {}),
        ...(values.draft !== undefined ? { layoutDraft: values.draft } : {}),
      },
    });
    return;
  }
  const entries: [string, string][] = [];
  if (values.published !== undefined) entries.push([HOME_PUBLISHED, values.published]);
  if (values.draft !== undefined) entries.push([HOME_DRAFT, values.draft]);
  for (const [key, value] of entries) {
    if (value === "") await prisma.siteSetting.deleteMany({ where: { key } });
    else
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
  }
}

const targetInfo = (target: LayoutTarget) =>
  target.kind === "home" ? { type: "setting", id: "home" } : { type: "page", id: target.id };

async function record(user: CurrentUser, target: LayoutTarget, action: string, extra = {}) {
  const info = targetInfo(target);
  await audit({
    actorId: user.id,
    action,
    targetType: info.type,
    targetId: info.id,
    detail: { target: target.kind, ...extra },
  });
}

function refresh(slug: string | null) {
  revalidatePath("/");
  if (slug) revalidatePath(`/pages/${slug}`);
}

/** Published and draft documents; each is null when empty or not valid. */
export async function getLayoutState(target: LayoutTarget): Promise<LayoutState> {
  const stored = await read(target);
  return { published: parseLayout(stored.published), draft: parseLayout(stored.draft) };
}

/** The published document only, for rendering the public page. Null means "use the theme template". */
export async function getPublishedLayout(target: LayoutTarget): Promise<LayoutDoc | null> {
  try {
    const doc = parseLayout((await read(target)).published);
    return doc ? await pruneMissingMedia(doc) : null;
  } catch {
    return null;
  }
}

/** Validates and stores the draft. Nothing public changes until publishDraft. */
export async function saveDraft(
  user: CurrentUser,
  target: LayoutTarget,
  docInput: unknown
): Promise<{ blocks: number }> {
  authorize(user, target);
  const doc = validateLayoutInput(docInput);
  await assertMediaExists(doc);
  await read(target); // the page must exist
  await write(target, { draft: JSON.stringify(doc) });
  const blocks = countBlocks(doc);
  await record(user, target, "builder.draft", { blocks });
  return { blocks };
}

/** Makes the draft the published layout and clears the draft. */
export async function publishDraft(user: CurrentUser, target: LayoutTarget): Promise<void> {
  authorize(user, target);
  const stored = await read(target);
  const doc = parseLayout(stored.draft);
  if (!doc) throw new ValidationError("There is no valid draft to publish.");
  await assertMediaExists(doc);
  await write(target, { published: JSON.stringify(doc), draft: "" });
  await record(user, target, "builder.publish", { blocks: countBlocks(doc) });
  refresh(stored.slug);
}

/** Throws the draft away; the published layout stays. */
export async function discardDraft(user: CurrentUser, target: LayoutTarget): Promise<void> {
  authorize(user, target);
  await read(target);
  await write(target, { draft: "" });
  await record(user, target, "builder.discard");
}

/** Removes both layouts, so the page uses the theme template again. */
export async function resetToTheme(user: CurrentUser, target: LayoutTarget): Promise<void> {
  authorize(user, target);
  const stored = await read(target);
  await write(target, { published: "", draft: "" });
  await record(user, target, "builder.reset");
  refresh(stored.slug);
}

function countBlocks(doc: LayoutDoc): number {
  const count = (nodes: LayoutDoc["blocks"]): number =>
    nodes.reduce((sum, n) => sum + 1 + (n.children ? count(n.children) : 0), 0);
  return count(doc.blocks);
}
