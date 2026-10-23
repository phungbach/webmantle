import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, resetDatabase } from "../helpers/db";

// The route reads cookies and headers of the current request; these tests supply them.
const cookieStore = { get: vi.fn(() => undefined), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

beforeEach(async () => {
  await resetDatabase();
  cookieStore.set.mockClear();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

async function call() {
  const { GET } = await import("@/app/demo/route");
  return GET();
}

describe("demo sign-in link", () => {
  it("is off unless DEMO_PUBLIC_LOGIN is true", async () => {
    const demo = await createUser("viewer");
    vi.stubEnv("DEMO_PUBLIC_LOGIN", "false");
    vi.stubEnv("DEMO_EMAIL", demo.email);
    const res = await call();
    expect(res.status).toBe(404);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("signs in the read-only demo account and opens /admin", async () => {
    const demo = await createUser("viewer");
    vi.stubEnv("DEMO_PUBLIC_LOGIN", "true");
    vi.stubEnv("DEMO_EMAIL", demo.email);
    const res = await call();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it("never signs in an account that can write", async () => {
    const admin = await createUser("admin");
    vi.stubEnv("DEMO_PUBLIC_LOGIN", "true");
    vi.stubEnv("DEMO_EMAIL", admin.email);
    const res = await call();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
