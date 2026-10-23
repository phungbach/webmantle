import "server-only";
import { redirect } from "next/navigation";
import { userMessage } from "@/lib/errors";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

export type ActionState = { ok: boolean; message: string; errors?: string[] };

/** Runs work and returns a user-safe result. Redirects are issued by the caller, outside try/catch. */
export async function attempt<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    // Full error goes to the server log only; the user sees the safe message.
    console.error(`[admin:${label}]`, error instanceof Error ? error.message : error);
    return { ok: false, message: userMessage(error) };
  }
}

export function backWith(path: string, key: "ok" | "error", message: string): never {
  const params = new URLSearchParams({ [key]: message });
  redirect(`${path}${path.includes("?") ? "&" : "?"}${params.toString()}`);
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Translated message for the visitor's language. Used by Server Actions for flash messages. */
export async function tm(key: MessageKey, vars?: Record<string, string | number>): Promise<string> {
  return t(await getLocale(), key, vars);
}
