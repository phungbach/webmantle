import { beforeEach, describe, expect, it } from "vitest";
import { GET as postsGET } from "@/app/api/v1/posts/route";
import { savePost } from "@/lib/content/mutations";
import { createUser, installBuiltIns, resetDatabase } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
  await installBuiltIns();
});

describe("public posts API", () => {
  it("returns only published posts and never internal fields", async () => {
    const author = await createUser("author");
    const editor = await createUser("editor");
    await savePost(editor, { title: "Live", slug: "live", body: "<p>x</p>", status: "published" });
    await savePost(author, {
      title: "Secret draft",
      slug: "secret-draft",
      body: "<p>x</p>",
      status: "draft",
    });
    const res = await postsGET(new Request("http://localhost/api/v1/posts"));
    const json = await res.json();
    expect(json.data.map((p: { slug: string }) => p.slug)).toEqual(["live"]);
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("secret-draft");
    expect(serialized).not.toContain("email");
    expect(json.meta).toMatchObject({ page: 1, totalPages: 1, total: 1, limit: 10 });
  });

  it("caps the page size at 50 and handles bad input", async () => {
    const res = await postsGET(new Request("http://localhost/api/v1/posts?limit=9999&page=-3"));
    const json = await res.json();
    expect(json.meta.limit).toBe(50);
    expect(json.meta.page).toBe(1);
    const bad = await postsGET(new Request("http://localhost/api/v1/posts?limit=abc"));
    expect((await bad.json()).meta.limit).toBe(10);
  });
});
