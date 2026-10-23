import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { hitRateLimit, MAX_BUCKETS } from "@/lib/auth/rate-limit";
import { apiError } from "@/lib/http";
import { POST as trackPOST } from "@/app/api/track/route";
import { GET as postsGET } from "@/app/api/v1/posts/route";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

const nav = vi.hoisted(() => ({ headers: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers([...nav.headers.entries()]),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

beforeEach(async () => {
  await resetDatabase();
  await prisma.pageView.deleteMany();
  nav.headers = new Map();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIpFrom", () => {
  const h = (v: string | null) => ({ get: () => v });
  it("ignores x-forwarded-for unless TRUST_PROXY is true", () => {
    vi.stubEnv("TRUST_PROXY", "");
    expect(clientIpFrom(h("1.2.3.4"))).not.toContain("1.2.3.4");
    expect(clientIpFrom(h("5.6.7.8"))).toBe(clientIpFrom(h("1.2.3.4")));
    vi.stubEnv("TRUST_PROXY", "yes");
    expect(clientIpFrom(h("1.2.3.4"))).not.toContain("1.2.3.4");
  });
  it("uses the first hop when TRUST_PROXY=true", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    expect(clientIpFrom(h("1.2.3.4, 10.0.0.1"))).toBe("1.2.3.4");
    expect(clientIpFrom(h(null))).toBe(clientIpFrom(h("")));
  });
});

describe("rate limiter storage", () => {
  it("prunes expired buckets and caps the number of keys", () => {
    const t0 = 1_000_000;
    hitRateLimit("old-key", 2, 1000, t0);
    expect(hitRateLimit("old-key", 2, 1000, t0).remaining).toBe(0);
    // after expiry it starts fresh
    expect(hitRateLimit("old-key", 2, 1000, t0 + 5000).remaining).toBe(1);

    hitRateLimit("first-key", 2, 3_600_000, t0);
    for (let i = 0; i < MAX_BUCKETS + 2500; i++) hitRateLimit(`flood-${i}`, 2, 3_600_000, t0);
    // oldest bucket was evicted, so it is fresh again; the newest is still counted
    expect(hitRateLimit("first-key", 2, 3_600_000, t0).remaining).toBe(1);
    const last = `flood-${MAX_BUCKETS + 2499}`;
    expect(hitRateLimit(last, 2, 3_600_000, t0).remaining).toBe(0);
  });
});

describe("login rate limits", () => {
  async function attempt(email: string, password = "wrong-password-1") {
    const { loginAction } = await import("@/app/admin/actions/auth");
    const form = new FormData();
    form.set("email", email);
    form.set("password", password);
    try {
      await loginAction(form);
    } catch (e) {
      return (e as Error).message;
    }
    return "no-redirect";
  }
  const tooMany = (msg: string) => msg.startsWith("REDIRECT:/login?error=") && /minute|phút|15/i.test(decodeURIComponent(msg));

  it("a spoofed x-forwarded-for does not reset the per-IP limit", async () => {
    vi.stubEnv("TRUST_PROXY", "");
    const email = "spoof@example.com";
    const results: string[] = [];
    for (let i = 0; i < 7; i++) {
      nav.headers = new Map([["x-forwarded-for", `9.9.9.${i}`]]);
      results.push(await attempt(email));
    }
    // first 5 are ordinary failures, then the limit message differs from the invalid-credentials one
    const normal = results[0];
    expect(results[4]).toBe(normal);
    expect(results[5]).not.toBe(normal);
    expect(results[6]).not.toBe(normal);
    expect(tooMany(results[5]!)).toBe(true);
  });

  it("locks an email after 10 failures even from different addresses (trusted proxy)", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const email = "multi@example.com";
    const results: string[] = [];
    for (let i = 0; i < 12; i++) {
      nav.headers = new Map([["x-forwarded-for", `8.8.8.${i}`]]);
      results.push(await attempt(email));
    }
    const normal = results[0];
    for (let i = 0; i < 10; i++) expect(results[i]).toBe(normal);
    expect(results[10]).not.toBe(normal);
    expect(results[11]).not.toBe(normal);
    // a correct password is refused while locked
    const user = await createUser("admin");
    for (let i = 0; i < 10; i++) {
      nav.headers = new Map([["x-forwarded-for", `7.7.7.${i}`]]);
      await attempt(user.email);
    }
    nav.headers = new Map([["x-forwarded-for", "7.7.7.200"]]);
    expect(await attempt(user.email, "correct horse battery")).not.toBe("REDIRECT:/admin");
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("POST /api/track origin checks", () => {
  const post = (headers: Record<string, string>, body = JSON.stringify({ path: "/" })) =>
    trackPOST(
      new Request("http://localhost:3000/api/track", {
        method: "POST",
        headers: { "user-agent": BROWSER, host: "localhost:3000", ...headers },
        body,
      })
    );
  const views = () => prisma.pageView.count();

  it("accepts the configured site origin and records the view", async () => {
    const res = await post({ origin: "http://localhost:3000" });
    expect(res.status).toBe(204);
    expect(await views()).toBe(1);
  });
  it("rejects a foreign origin with 403", async () => {
    const res = await post({ origin: "https://evil.example.org" });
    expect(res.status).toBe(403);
    expect(await views()).toBe(0);
  });
  it("does not trust the Host header over SITE_URL", async () => {
    const res = await post({ origin: "https://evil.example.org", host: "evil.example.org" });
    expect(res.status).toBe(403);
  });
  it("allows localhost only outside production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ origin: "http://localhost:5555" })).status).toBe(403);
    vi.stubEnv("NODE_ENV", "development");
    expect((await post({ origin: "http://localhost:5555" })).status).toBe(204);
  });
  it("without Origin accepts only same-origin or same-site fetches", async () => {
    expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(204);
    expect(await views()).toBe(1);
    await prisma.pageView.deleteMany();
    for (const headers of [{} as Record<string, string>,{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "none" }]) {
      const res = await post(headers);
      expect(res.status).toBe(204);
    }
    expect(await views()).toBe(0);
  });
  it("answers 413 for a body over 2000 characters", async () => {
    const res = await post({ origin: "http://localhost:3000" }, JSON.stringify({ path: "/", x: "a".repeat(2100) }));
    expect(res.status).toBe(413);
  });
  it("honours DNT and GPC with a quiet 204", async () => {
    expect((await post({ origin: "http://localhost:3000", dnt: "1" })).status).toBe(204);
    expect((await post({ origin: "http://localhost:3000", "sec-gpc": "1" })).status).toBe(204);
    expect(await views()).toBe(0);
  });
});

describe("GET /api/v1/posts rate limit", () => {
  beforeEach(async () => {
    await installBuiltIns();
  });
  const get = (ip: string) =>
    postsGET(new Request("http://localhost/api/v1/posts", { headers: { "x-forwarded-for": ip } }));

  it("returns 429 with Retry-After and the standard error shape", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const ip = "198.51.100.77";
    let last: Response | null = null;
    let okCount = 0;
    for (let i = 0; i < 125; i++) {
      last = await get(ip);
      if (last.status === 200) okCount++;
    }
    expect(okCount).toBe(120);
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    const json = await last!.json();
    expect(json.error.code).toEqual(expect.any(String));
    expect(json.error.message).toEqual(expect.any(String));
    // another client is unaffected
    expect((await get("198.51.100.78")).status).toBe(200);
  });
});

describe("apiError", () => {
  it("builds {error:{code,message}} with status and headers", async () => {
    const res = apiError(418, "teapot", "short and stout", { "X-Test": "1" });
    expect(res.status).toBe(418);
    expect(res.headers.get("x-test")).toBe("1");
    expect(await res.json()).toEqual({ error: { code: "teapot", message: "short and stout" } });
  });
});

describe("next.config security headers", () => {
  async function headersFor(env: string) {
    vi.stubEnv("NODE_ENV", env);
    vi.resetModules();
    const config = (await import("../../next.config")).default;
    const rules = await config.headers!();
    const flat = new Map<string, string>();
    for (const r of rules) for (const h of r.headers) flat.set(h.key, h.value);
    return { rules, flat };
  }
  it("sends a strict CSP and COOP in production without unsafe-eval", async () => {
    const { flat } = await headersFor("production");
    const csp = flat.get("Content-Security-Policy")!;
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ])
      expect(csp).toContain(d);
    expect(csp).not.toContain("unsafe-eval");
    expect(flat.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(flat.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("does not apply the global CSP to media and theme assets", async () => {
    const { rules } = await headersFor("production");
    const cspRule = rules.find(
      (r) =>
        r.headers.some((h) => h.key === "Content-Security-Policy") &&
        r.headers.every((h) => h.key !== "X-Frame-Options")
    )!;
    const re = sourceRegex(cspRule.source);
    expect(re.test("/media/abc")).toBe(false);
    expect(re.test("/theme-assets/x/y")).toBe(false);
    expect(re.test("/posts/hello")).toBe(true);
  });

  // The designer preview is the one place the admin may frame; the final path is /design-preview.
  const sourceRegex = (source: string) =>
    new RegExp(`^${source.replace(/:path\*/g, ".*")}$`);
  const valueOf = (rule: { headers: { key: string; value: string }[] }, key: string) =>
    rule.headers.find((h) => h.key === key)?.value;

  it("denies framing everywhere except the designer preview", async () => {
    const { rules } = await headersFor("production");
    const previewRule = rules.find((r) => valueOf(r, "X-Frame-Options") === "SAMEORIGIN")!;
    expect(previewRule).toBeDefined();
    expect(valueOf(previewRule, "Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(valueOf(previewRule, "Content-Security-Policy")).not.toContain("frame-ancestors 'none'");
    expect(valueOf(previewRule, "Content-Security-Policy")).toContain("object-src 'none'");
    const previewRe = sourceRegex(previewRule.source);
    const previewPath = previewRule.source.replace("/:path*", "/page/abc");
    expect(previewRe.test(previewPath)).toBe(true);
    expect(previewPath).toMatch(/design-preview/);

    const denyRules = rules.filter((r) => valueOf(r, "X-Frame-Options") === "DENY");
    expect(denyRules.length).toBeGreaterThan(0);
    const denied = (path: string) => denyRules.some((r) => sourceRegex(r.source).test(path));
    for (const path of ["/", "/admin", "/admin/pages", "/posts/a", "/media/x", "/login"])
      expect(denied(path), path).toBe(true);
    expect(denied(previewPath)).toBe(false);

    // Rules whose source matches the preview path must never also set the strict 'none' CSP.
    const cspRules = rules.filter((r) => valueOf(r, "Content-Security-Policy"));
    for (const r of cspRules) {
      if (sourceRegex(r.source).test(previewPath))
        expect(valueOf(r, "Content-Security-Policy")).toContain("frame-ancestors 'self'");
    }
    // The phone-size theme preview (/preview/<theme>) is framed by the admin page too, same origin only.
    const themePreview = "/preview/webcore";
    const themeRule = rules.find(
      (r) => valueOf(r, "X-Frame-Options") === "SAMEORIGIN" && sourceRegex(r.source).test(themePreview)
    )!;
    expect(themeRule).toBeDefined();
    expect(valueOf(themeRule, "Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(denied(themePreview)).toBe(false);
    // Everywhere else the CSP forbids framing too.
    const global = cspRules.find(
      (r) =>
        !sourceRegex(r.source).test(previewPath) && !sourceRegex(r.source).test(themePreview)
    )!;
    expect(valueOf(global, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(denied("/")).toBe(true);
  });
});
