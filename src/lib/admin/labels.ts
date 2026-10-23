import type { tr } from "@/lib/i18n";
import { vi, type MessageKey } from "@/lib/i18n/messages";

type Translate = ReturnType<typeof tr>;

/** Label for a post or page status ("published", "draft", "archived"). */
export function statusLabel(T: Translate, status: string): string {
  if (status === "published") return T("ui.statusPublished");
  if (status === "archived") return T("ui.statusArchived");
  return T("ui.statusDraft");
}

export type AuditKind = "login" | "edit" | "config" | "delete";

/** Groups audit actions such as "auth.login" or "post.delete" for the filter pills and badges. */
export function auditKind(action: string): AuditKind {
  if (/login|logout/.test(action)) return "login";
  if (/delete|remove|uninstall|rollback-clear/.test(action)) return "delete";
  if (/^(settings|appearance|theme|plugin|blog-style|site)|\.settings|activate/.test(action))
    return "config";
  return "edit";
}

/** Translated name of an audit action, or the raw action string when no label exists. */
export function auditActionLabel(T: Translate, action: string): string {
  const key = `audit.action.${action}`;
  return key in vi ? T(key as MessageKey) : action;
}
