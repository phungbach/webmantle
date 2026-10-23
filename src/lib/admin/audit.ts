import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditGroup = "auth" | "content" | "appearance" | "system" | "users" | "failed";

export const AUDIT_GROUP_IDS: readonly AuditGroup[] = [
  "auth",
  "content",
  "appearance",
  "system",
  "users",
  "failed",
];

const CONTENT_PREFIXES = ["post", "page", "category", "tag", "media"];
const APPEARANCE_PREFIXES = ["theme", "appearance", "blog-style"];

/** Which filter group an action belongs to. Mirrors the CASE expression used in SQL below. */
export function auditGroupOf(action: string): AuditGroup {
  if (action.endsWith("-failed") || action.endsWith("rejected")) return "failed";
  const prefix = action.split(".")[0] ?? "";
  if (prefix === "auth") return "auth";
  if (CONTENT_PREFIXES.includes(prefix)) return "content";
  if (APPEARANCE_PREFIXES.includes(prefix)) return "appearance";
  if (prefix === "user") return "users";
  return "system";
}

export type AuditRow = {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  targetHref: string | null;
};

export type AuditListOptions = {
  q?: string;
  group?: AuditGroup;
  actorId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export type AuditListResult = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: Record<AuditGroup, number>;
  actors: { id: string; name: string }[];
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const EXPORT_LIMIT = 10_000;

const GROUP_CASE = Prisma.sql`CASE
  WHEN a."action" LIKE '%-failed' OR a."action" LIKE '%rejected' THEN 'failed'
  WHEN a."action" LIKE 'auth.%' THEN 'auth'
  WHEN a."action" LIKE 'post.%' OR a."action" LIKE 'page.%' OR a."action" LIKE 'category.%'
    OR a."action" LIKE 'tag.%' OR a."action" LIKE 'media.%' THEN 'content'
  WHEN a."action" LIKE 'theme.%' OR a."action" LIKE 'appearance.%'
    OR a."action" LIKE 'blog-style.%' THEN 'appearance'
  WHEN a."action" LIKE 'user.%' THEN 'users'
  ELSE 'system' END`;

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Filters other than the group; shared by the rows, the counts and the actor list. */
function baseWhere(opts: AuditListOptions): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${escapeLike(q.slice(0, 100))}%`;
    parts.push(
      Prisma.sql`(a."action" LIKE ${like} ESCAPE '\\' OR a."targetType" LIKE ${like} ESCAPE '\\'
        OR a."targetId" LIKE ${like} ESCAPE '\\' OR u."name" LIKE ${like} ESCAPE '\\')`
    );
  }
  if (opts.actorId) parts.push(Prisma.sql`a."actorId" = ${opts.actorId}`);
  if (opts.from) parts.push(Prisma.sql`a."createdAt" >= ${opts.from.getTime()}`);
  if (opts.to) parts.push(Prisma.sql`a."createdAt" <= ${opts.to.getTime()}`);
  return parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

type RawRow = {
  id: string;
  createdAt: bigint | number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  ip: string | null;
  userAgent: string | null;
};

function parseDetail(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const HREF: Record<string, (id: string) => string> = {
  post: (id) => `/admin/posts/${encodeURIComponent(id)}`,
  page: (id) => `/admin/pages/${encodeURIComponent(id)}`,
  user: () => "/admin/users",
  theme: (id) => `/admin/themes/${encodeURIComponent(id)}`,
  plugin: (id) => `/admin/plugins/${encodeURIComponent(id)}`,
  category: () => "/admin/categories",
  tag: () => "/admin/tags",
  media: () => "/admin/media",
};

/** Ids that still exist, per target type, so links never lead to a missing record. */
async function existingTargets(raw: RawRow[]): Promise<Map<string, Set<string>>> {
  const ids = (type: string) => [
    ...new Set(raw.filter((r) => r.targetType === type).map((r) => r.targetId)),
  ];
  const where = (type: string) => ({ where: { id: { in: ids(type) } }, select: { id: true } });
  const [post, page, user, theme, plugin, category, tag, media] = await Promise.all([
    ids("post").length ? prisma.post.findMany(where("post")) : [],
    ids("page").length ? prisma.page.findMany(where("page")) : [],
    ids("user").length ? prisma.user.findMany(where("user")) : [],
    ids("theme").length ? prisma.theme.findMany(where("theme")) : [],
    ids("plugin").length ? prisma.plugin.findMany(where("plugin")) : [],
    ids("category").length ? prisma.category.findMany(where("category")) : [],
    ids("tag").length ? prisma.tag.findMany(where("tag")) : [],
    ids("media").length ? prisma.media.findMany(where("media")) : [],
  ]);
  const toSet = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  return new Map([
    ["post", toSet(post)],
    ["page", toSet(page)],
    ["user", toSet(user)],
    ["theme", toSet(theme)],
    ["plugin", toSet(plugin)],
    ["category", toSet(category)],
    ["tag", toSet(tag)],
    ["media", toSet(media)],
  ]);
}

async function toRows(raw: RawRow[]): Promise<AuditRow[]> {
  const existing = await existingTargets(raw);
  return raw.map((r) => ({
    id: r.id,
    createdAt: new Date(Number(r.createdAt)),
    actorId: r.actorId,
    actorName: r.actorName,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    detail: parseDetail(r.detail),
    ip: r.ip,
    userAgent: r.userAgent,
    targetHref:
      existing.get(r.targetType)?.has(r.targetId) && HREF[r.targetType]
        ? HREF[r.targetType]!(r.targetId)
        : null,
  }));
}

const SELECT_ROWS = Prisma.sql`SELECT a."id" AS id, a."createdAt" AS createdAt, a."actorId" AS actorId,
  u."name" AS actorName, a."action" AS action, a."targetType" AS targetType,
  a."targetId" AS targetId, a."detail" AS detail, a."ip" AS ip, a."userAgent" AS userAgent
  FROM "AuditLog" a LEFT JOIN "User" u ON u."id" = a."actorId"`;

function groupFilter(group: AuditGroup | undefined, hasWhere: boolean): Prisma.Sql {
  if (!group) return Prisma.empty;
  return Prisma.sql`${hasWhere ? Prisma.sql` AND` : Prisma.sql` WHERE`} (${GROUP_CASE}) = ${group}`;
}

/** Filtered, paged audit entries. Filtering, counting and paging all happen in SQL. */
export async function listAuditLogs(opts: AuditListOptions = {}): Promise<AuditListResult> {
  const pageSize = Math.min(
    Math.max(Math.trunc(opts.pageSize ?? DEFAULT_PAGE_SIZE) || 1, 1),
    MAX_PAGE_SIZE
  );
  const where = baseWhere(opts);
  const hasWhere = where !== Prisma.empty;

  const [countRows, actors] = await Promise.all([
    prisma.$queryRaw<{ grp: string; n: bigint | number }[]>`
      SELECT (${GROUP_CASE}) AS grp, COUNT(*) AS n
      FROM "AuditLog" a LEFT JOIN "User" u ON u."id" = a."actorId"
      ${where} GROUP BY grp`,
    prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT DISTINCT u."id" AS id, u."name" AS name
      FROM "AuditLog" a JOIN "User" u ON u."id" = a."actorId"
      ORDER BY u."name" ASC`,
  ]);
  const counts: Record<AuditGroup, number> = {
    auth: 0,
    content: 0,
    appearance: 0,
    system: 0,
    users: 0,
    failed: 0,
  };
  for (const r of countRows) counts[r.grp as AuditGroup] = Number(r.n);
  const total = opts.group
    ? counts[opts.group]
    : AUDIT_GROUP_IDS.reduce((sum, g) => sum + counts[g], 0);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(opts.page ?? 1) || 1, 1), pageCount);
  const raw = await prisma.$queryRaw<RawRow[]>`
    ${SELECT_ROWS} ${where} ${groupFilter(opts.group, hasWhere)}
    ORDER BY a."createdAt" DESC, a."id" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

  return { rows: await toRows(raw), total, page, pageCount, counts, actors };
}

/** Same filters, no paging: up to 10,000 newest entries, for CSV export. */
export async function listAuditLogsForExport(
  opts: Omit<AuditListOptions, "page" | "pageSize"> = {}
): Promise<AuditRow[]> {
  const where = baseWhere(opts);
  const raw = await prisma.$queryRaw<RawRow[]>`
    ${SELECT_ROWS} ${where} ${groupFilter(opts.group, where !== Prisma.empty)}
    ORDER BY a."createdAt" DESC, a."id" DESC
    LIMIT ${EXPORT_LIMIT}`;
  return toRows(raw);
}
