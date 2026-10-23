import type { Role } from "@/lib/validation/schemas";

export type Permission =
  | "content:write-own"
  | "content:write-any"
  | "content:publish"
  | "taxonomy:manage"
  | "media:upload"
  | "themes:manage"
  | "settings:manage"
  | "users:manage"
  | "audit:read"
  | "plugins:manage";

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    "content:write-own",
    "content:write-any",
    "content:publish",
    "taxonomy:manage",
    "media:upload",
    "themes:manage",
    "settings:manage",
    "users:manage",
    "audit:read",
    "plugins:manage",
  ]),
  editor: new Set<Permission>([
    "content:write-own",
    "content:write-any",
    "content:publish",
    "taxonomy:manage",
    "media:upload",
  ]),
  author: new Set<Permission>(["content:write-own", "media:upload"]),
  // Read-only demo account: no permission at all, so every Server Action and API write is refused.
  viewer: new Set<Permission>(),
};

/**
 * Whether a role may open (not change) the admin screen that needs this permission. The viewer role
 * may look at everything an administrator can; changes are still refused by `can` in every action.
 */
export function canView(role: string, permission: Permission): boolean {
  return role === "viewer" || can(role, permission);
}

export function can(role: string, permission: Permission): boolean {
  return (MATRIX as Record<string, ReadonlySet<Permission>>)[role]?.has(permission) ?? false;
}
