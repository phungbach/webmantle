"use server";

import { requirePermission } from "@/lib/auth/session";
import { userMessage, ValidationError } from "@/lib/errors";
import { getLocale } from "@/lib/i18n/server";
import { resolveActiveTheme } from "@/lib/themes/registry";
import {
  discardContentDraft,
  publishContent,
  saveContentKey,
} from "@/lib/themes/content-overrides";
import { tm } from "@/app/admin/actions/shared";

export type ContentResult = { ok: true; message: string } | { ok: false; message: string };

/** The theme and language are always the active ones on the server, never taken from the client. */
async function run(
  label: string,
  work: (
    user: Awaited<ReturnType<typeof requirePermission>>,
    themeId: string,
    locale: string
  ) => Promise<string>
): Promise<ContentResult> {
  try {
    const user = await requirePermission("settings:manage");
    const [{ bundle }, locale] = await Promise.all([resolveActiveTheme(), getLocale()]);
    return { ok: true, message: await work(user, bundle.id, locale) };
  } catch (error) {
    console.error(`[admin:theme-content:${label}]`, error instanceof Error ? error.message : error);
    return { ok: false, message: userMessage(error) };
  }
}

/** Saves one content block (a whole key) to the draft; `valueJson` null resets it to the theme default. */
export async function saveContentKeyAction(
  key: string,
  valueJson: string | null
): Promise<ContentResult> {
  return run("save", async (user, themeId, locale) => {
    let value: unknown = null;
    if (valueJson !== null) {
      if (typeof valueJson !== "string" || valueJson.length > 200 * 1024)
        throw new ValidationError("The content is too large.");
      try {
        value = JSON.parse(valueJson);
      } catch {
        throw new ValidationError("The content is not valid JSON.");
      }
      if (value === null) throw new ValidationError("The content is not valid.");
    }
    await saveContentKey(user, themeId, locale, key, value);
    return tm("builder.saved");
  });
}

export async function publishContentAction(): Promise<ContentResult> {
  return run("publish", async (user, themeId, locale) => {
    await publishContent(user, themeId, locale);
    return tm("builder.published");
  });
}

export async function discardContentAction(): Promise<ContentResult> {
  return run("discard", async (user, themeId, locale) => {
    await discardContentDraft(user, themeId, locale);
    return tm("builder.discarded");
  });
}
