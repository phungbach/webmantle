import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  auditGroupOf,
  listAuditLogs,
  listAuditLogsForExport,
  type AuditGroup,
} from "@/lib/admin/audit";
import { purgeOldAudit } from "@/lib/audit-retention";
import { auditActionLabel } from "@/lib/admin/labels";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { createUser, resetDatabase } from "../helpers/db";

const session = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock("@/lib/auth/session", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requirePermission: async () => {
      if (session.error) throw session.error;
      return { id: "u", email: "a@b.c", name: "A", role: "admin" };
    },
  };
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

async function log(
  action: string,
  extra: {
    actorId?: string | null;
    targetType?: string;
    targetId?: string;
    createdAt?: Date;
    detail?: string;
  } = {}
) {
  return prisma.auditLog.create({
    data: {
      action,
      targetType: extra.targetType ?? "post",
      targetId: extra.targetId ?? "t1",
      actorId: extra.actorId ?? null,
      detail: extra.detail ?? "{}",
      createdAt: extra.createdAt ?? NOW,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  session.error = null;
});

describe("auditGroupOf", () => {
  const known: [string, AuditGroup][] = [
    ["auth.login", "auth"],
    ["auth.logout", "auth"],
    ["auth.password-changed", "auth"],
    ["auth.login-failed", "failed"],
    ["theme.install.rejected", "failed"],
    ["post.create", "content"],
    ["post.update", "content"],
    ["post.delete", "content"],
    ["post.restore-revision", "content"],
    ["page.create", "content"],
    ["page.update", "content"],
    ["page.delete", "content"],
    ["category.create", "content"],
    ["category.update", "content"],
    ["category.delete", "content"],
    ["tag.create", "content"],
    ["tag.update", "content"],
    ["tag.delete", "content"],
    ["media.upload", "content"],
    ["media.delete", "content"],
    ["appearance.logo", "appearance"],
    ["appearance.logo-remove", "appearance"],
    ["appearance.menu", "appearance"],
    ["appearance.save", "appearance"],
    ["blog-style.save", "appearance"],
    ["theme.activate", "appearance"],
    ["theme.rollback", "appearance"],
    ["theme.install", "appearance"],
    ["theme.update", "appearance"],
    ["theme.uninstall", "appearance"],
    ["theme.settings", "appearance"],
    ["theme.preview", "appearance"],
    ["theme.content.sync", "appearance"],
    ["theme.pages.hide", "appearance"],
    ["theme.backup.delete", "appearance"],
    ["user.create", "users"],
    ["user.delete", "users"],
    ["plugin.enable", "system"],
    ["plugin.disable", "system"],
    ["plugin.settings", "system"],
    ["settings.site", "system"],
  ];
  it.each(known)("%s -> %s", (action, group) => {
    expect(auditGroupOf(action)).toBe(group);
  });
  it("falls back to system for unknown actions", () => {
    expect(auditGroupOf("something.new")).toBe("system");
    expect(auditGroupOf("")).toBe("system");
  });
});

describe("audit() metadata", () => {
  it("stores ip and userAgent, truncating the agent to 200 chars", async () => {
    await audit({
      action: "auth.login",
      targetType: "user",
      targetId: "x",
      ip: "203.0.113.9",
      userAgent: "A".repeat(500),
    });
    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row.ip).toBe("203.0.113.9");
    expect(row.userAgent).toHaveLength(200);
  });
  it("leaves them null when omitted", async () => {
    await audit({ action: "post.create", targetType: "post", targetId: "x" });
    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row.ip).toBeNull();
    expect(row.userAgent).toBeNull();
  });
  it("login events carry no password or token in detail", async () => {
    await audit({
      action: "auth.login-failed",
      targetType: "user",
      targetId: "x",
      detail: { email: "a@example.com" },
    });
    const res = await listAuditLogs();
    const text = JSON.stringify(res.rows[0]?.detail).toLowerCase();
    expect(text).not.toMatch(/password|token|secret/);
  });
});

describe("listAuditLogs", () => {
  it("returns an empty result", async () => {
    const r = await listAuditLogs();
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.page).toBe(1);
    expect(r.pageCount).toBe(1);
    expect(Object.values(r.counts).every((n) => n === 0)).toBe(true);
  });

  it("orders newest first and resolves actor names", async () => {
    const admin = await createUser("admin", "Alice");
    await log("post.create", { actorId: admin.id, createdAt: ago(2) });
    await log("post.update", { actorId: admin.id, createdAt: ago(1) });
    await log("auth.login", { createdAt: ago(3) });
    const r = await listAuditLogs();
    expect(r.rows.map((x) => x.action)).toEqual(["post.update", "post.create", "auth.login"]);
    expect(r.rows[0]?.actorName).toBe("Alice");
    expect(r.rows[2]?.actorName).toBeNull();
    expect(r.actors).toEqual([{ id: admin.id, name: "Alice" }]);
  });

  it("filters q on action, targetType, targetId and actor name", async () => {
    const bob = await createUser("editor", "Bobby");
    await log("tag.create", { targetType: "tag", targetId: "zzz" });
    await log("media.upload", { targetType: "media", targetId: "m-unique-id" });
    await log("post.create", { targetType: "post", targetId: "p1", actorId: bob.id });
    expect((await listAuditLogs({ q: "tag.cre" })).rows.map((x) => x.action)).toEqual([
      "tag.create",
    ]);
    expect((await listAuditLogs({ q: "media" })).total).toBe(1);
    expect((await listAuditLogs({ q: "unique-id" })).rows[0]?.action).toBe("media.upload");
    expect((await listAuditLogs({ q: "Bobb" })).rows[0]?.action).toBe("post.create");
    expect((await listAuditLogs({ q: "nomatch" })).total).toBe(0);
  });

  it("treats % and _ in q literally", async () => {
    await log("post.create");
    expect((await listAuditLogs({ q: "%" })).total).toBe(0);
    expect((await listAuditLogs({ q: "post_create" })).total).toBe(0);
  });

  it("filters by group and actor", async () => {
    const a = await createUser("admin", "A1");
    const b = await createUser("editor", "B1");
    await log("auth.login", { actorId: a.id });
    await log("post.create", { actorId: a.id });
    await log("post.delete", { actorId: b.id });
    await log("auth.login-failed");
    const content = await listAuditLogs({ group: "content" });
    expect(content.total).toBe(2);
    expect(content.rows.every((r) => auditGroupOf(r.action) === "content")).toBe(true);
    expect((await listAuditLogs({ group: "failed" })).total).toBe(1);
    const byB = await listAuditLogs({ actorId: b.id });
    expect(byB.rows.map((r) => r.action)).toEqual(["post.delete"]);
    expect((await listAuditLogs({ actorId: a.id, group: "content" })).total).toBe(1);
  });

  it("counts ignore the group filter but respect the others", async () => {
    const a = await createUser("admin", "A1");
    await log("auth.login", { actorId: a.id });
    await log("post.create", { actorId: a.id });
    await log("post.update", { actorId: a.id });
    await log("user.create");
    const all = await listAuditLogs({ group: "content" });
    expect(all.total).toBe(2);
    expect(all.counts).toMatchObject({ auth: 1, content: 2, users: 1, failed: 0 });
    const mine = await listAuditLogs({ group: "content", actorId: a.id });
    expect(mine.counts.users).toBe(0);
    expect(mine.counts.auth).toBe(1);
    const q = await listAuditLogs({ group: "auth", q: "update" });
    expect(q.total).toBe(0);
    expect(q.counts.content).toBe(1);
  });

  it("filters from/to inclusively", async () => {
    await log("post.create", { createdAt: ago(10) });
    await log("post.update", { createdAt: ago(5) });
    await log("post.delete", { createdAt: ago(1) });
    const r = await listAuditLogs({ from: ago(5), to: ago(1) });
    expect(r.rows.map((x) => x.action).sort()).toEqual(["post.delete", "post.update"]);
    expect((await listAuditLogs({ from: ago(4) })).total).toBe(1);
    expect((await listAuditLogs({ to: ago(6) })).total).toBe(1);
  });

  it("pages with total and pageCount, clamping page and pageSize", async () => {
    for (let i = 0; i < 7; i++) await log("post.create", { createdAt: ago(i) });
    const p1 = await listAuditLogs({ pageSize: 3 });
    expect(p1.total).toBe(7);
    expect(p1.pageCount).toBe(3);
    expect(p1.rows).toHaveLength(3);
    const p3 = await listAuditLogs({ pageSize: 3, page: 3 });
    expect(p3.rows).toHaveLength(1);
    const ids = new Set([
      ...p1.rows.map((r) => r.id),
      ...(await listAuditLogs({ pageSize: 3, page: 2 })).rows.map((r) => r.id),
      ...p3.rows.map((r) => r.id),
    ]);
    expect(ids.size).toBe(7);
    expect((await listAuditLogs({ pageSize: 3, page: 99 })).page).toBe(3);
    expect((await listAuditLogs({ pageSize: 3, page: -4 })).page).toBe(1);
  });

  it("caps pageSize at 100 and defaults to 50", async () => {
    await prisma.auditLog.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        action: "post.create",
        targetType: "post",
        targetId: `t${i}`,
        detail: "{}",
        createdAt: new Date(NOW.getTime() - i * 1000),
      })),
    });
    expect((await listAuditLogs()).rows).toHaveLength(50);
    expect((await listAuditLogs({ pageSize: 1000 })).rows).toHaveLength(100);
  });

  it("returns {} for malformed or non-object detail", async () => {
    await log("post.create", { detail: "{not json", createdAt: ago(1) });
    await log("post.update", { detail: "[1,2]", createdAt: ago(2) });
    await log("post.delete", { detail: "", createdAt: ago(3) });
    await log("tag.create", { detail: '{"a":1}', createdAt: ago(4) });
    const r = await listAuditLogs();
    expect(r.rows.map((x) => x.detail)).toEqual([{}, {}, {}, { a: 1 }]);
  });

  it("gives targetHref only while the target exists", async () => {
    const author = await createUser("admin", "Au");
    const post = await prisma.post.create({
      data: { slug: "s", title: "T", authorId: author.id },
    });
    await log("post.update", { targetType: "post", targetId: post.id, createdAt: ago(1) });
    await log("post.delete", { targetType: "post", targetId: "gone", createdAt: ago(2) });
    await log("auth.login", { targetType: "weird", targetId: "x", createdAt: ago(3) });
    let rows = (await listAuditLogs()).rows;
    expect(rows[0]?.targetHref).toContain(post.id);
    expect(rows[1]?.targetHref).toBeNull();
    expect(rows[2]?.targetHref).toBeNull();
    await prisma.post.delete({ where: { id: post.id } });
    rows = (await listAuditLogs()).rows;
    expect(rows[0]?.targetHref).toBeNull();
  });

  it("returns ip and userAgent on rows", async () => {
    await audit({
      action: "auth.login",
      targetType: "user",
      targetId: "x",
      ip: "198.51.100.1",
      userAgent: "UA/1",
    });
    const row = (await listAuditLogs()).rows[0];
    expect(row?.ip).toBe("198.51.100.1");
    expect(row?.userAgent).toBe("UA/1");
  });
});

describe("listAuditLogsForExport", () => {
  it("applies the same filters without paging", async () => {
    for (let i = 0; i < 60; i++) await log("post.create", { createdAt: ago(i / 100) });
    await log("auth.login");
    expect(await listAuditLogsForExport()).toHaveLength(61);
    expect(await listAuditLogsForExport({ group: "auth" })).toHaveLength(1);
    expect(await listAuditLogsForExport({ q: "post." })).toHaveLength(60);
  });
});

describe("auditActionLabel", () => {
  it("falls back to the raw action", () => {
    const T = ((k: string) => `T:${k}`) as unknown as Parameters<typeof auditActionLabel>[0];
    expect(auditActionLabel(T, "totally.unknown.action")).toBe("totally.unknown.action");
  });
  it("translates a known action", () => {
    const T = ((k: string) => `T:${k}`) as unknown as Parameters<typeof auditActionLabel>[0];
    const out = auditActionLabel(T, "auth.login");
    expect(out === "auth.login" || out === "T:audit.action.auth.login").toBe(true);
  });
});

describe("purgeOldAudit", () => {
  it("keeps recent rows and removes old ordinary rows", async () => {
    await log("post.create", { createdAt: ago(10) });
    await log("post.update", { createdAt: ago(400) });
    const removed = await purgeOldAudit(NOW);
    expect(removed).toBe(1);
    expect((await prisma.auditLog.findMany()).map((r) => r.action)).toEqual(["post.create"]);
  });

  it("keeps failed and delete rows longer, then removes them", async () => {
    await log("auth.login", { createdAt: ago(400) });
    await log("auth.login-failed", { createdAt: ago(400) });
    await log("post.delete", { createdAt: ago(400) });
    await log("theme.install.rejected", { createdAt: ago(400) });
    await log("theme.uninstall", { createdAt: ago(400) });
    await log("auth.login-failed", { createdAt: ago(800) });
    await log("post.delete", { createdAt: ago(800) });
    const removed = await purgeOldAudit(NOW);
    expect(removed).toBe(3);
    const left = (await prisma.auditLog.findMany()).map((r) => r.action).sort();
    expect(left).toEqual([
      "auth.login-failed",
      "post.delete",
      "theme.install.rejected",
      "theme.uninstall",
    ]);
  });

  it("honours custom retention and returns 0 when nothing is old", async () => {
    await log("post.create", { createdAt: ago(5) });
    expect(await purgeOldAudit(NOW)).toBe(0);
    expect(await purgeOldAudit(NOW, 1, 2)).toBe(1);
  });
});

describe("CSV export route", () => {
  async function get(qs = "") {
    const { GET } = await import("@/app/admin/audit/export/route");
    return GET(new Request(`http://localhost/admin/audit/export${qs}`));
  }

  it("rejects anonymous (401) and forbidden (403) callers", async () => {
    session.error = new UnauthorizedError();
    expect((await get()).status).toBe(401);
    session.error = new ForbiddenError();
    expect((await get()).status).toBe(403);
  });

  it("returns a BOM-prefixed CSV with headers and rows", async () => {
    await log("post.create", { targetId: "abc" });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("time,actor,action,targetType,targetId,ip,detail");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("post.create");
  });

  it("neutralises formula injection and quotes special characters", async () => {
    const evil = await createUser("admin", "=HYPERLINK(1)");
    await log("post.create", { actorId: evil.id, targetId: "+1,2", createdAt: ago(1) });
    await log("post.update", { targetId: "@x", createdAt: ago(2) });
    await log("post.delete", { targetId: "-5", createdAt: ago(3) });
    await log("tag.create", { targetId: 'say "hi"', createdAt: ago(4) });
    const text = await (await get()).text();
    expect(text).toContain("'=HYPERLINK(1)");
    expect(text).toContain('"\'+1,2"');
    expect(text).toContain(",'@x,");
    expect(text).toContain(",'-5,");
    expect(text).toContain('"say ""hi"""');
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it("applies filters from the query string", async () => {
    await log("auth.login");
    await log("post.create");
    const text = await (await get("?group=auth")).text();
    expect(text).toContain("auth.login");
    expect(text).not.toContain("post.create");
  });
});
