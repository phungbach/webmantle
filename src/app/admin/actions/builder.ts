"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { userMessage, ValidationError } from "@/lib/errors";
import { discardDraft, publishDraft, resetToTheme, saveDraft } from "@/lib/builder/store";
import type { LayoutTarget } from "@/lib/builder/store";
import { tm } from "@/app/admin/actions/shared";

export type BuilderResult =
  { ok: true; message: string; blocks?: number } | { ok: false; message: string };

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), id: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal("home") }).strict(),
]);

async function run(
  label: string,
  rawTarget: unknown,
  work: (
    user: Awaited<ReturnType<typeof requirePermission>>,
    target: LayoutTarget
  ) => Promise<BuilderResult>
): Promise<BuilderResult> {
  try {
    const parsed = targetSchema.safeParse(rawTarget);
    if (!parsed.success) throw new ValidationError("Invalid target.");
    const target = parsed.data;
    const user = await requirePermission(
      target.kind === "home" ? "settings:manage" : "content:write-any"
    );
    return await work(user, target);
  } catch (error) {
    console.error(`[admin:builder:${label}]`, error instanceof Error ? error.message : error);
    return { ok: false, message: userMessage(error) };
  }
}

export async function saveDraftAction(
  target: LayoutTarget,
  docJson: string
): Promise<BuilderResult> {
  return run("draft", target, async (user, t) => {
    const { blocks } = await saveDraft(user, t, docJson);
    return { ok: true, message: await tm("builder.saved"), blocks };
  });
}

export async function publishAction(target: LayoutTarget): Promise<BuilderResult> {
  return run("publish", target, async (user, t) => {
    await publishDraft(user, t);
    return { ok: true, message: await tm("builder.published") };
  });
}

export async function discardDraftAction(target: LayoutTarget): Promise<BuilderResult> {
  return run("discard", target, async (user, t) => {
    await discardDraft(user, t);
    return { ok: true, message: await tm("builder.discarded") };
  });
}

export async function resetAction(target: LayoutTarget): Promise<BuilderResult> {
  return run("reset", target, async (user, t) => {
    await resetToTheme(user, t);
    return { ok: true, message: await tm("builder.resetDone") };
  });
}
