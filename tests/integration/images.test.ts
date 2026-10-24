import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MEDIA_DIR } from "@/lib/env";
import {
  ALLOWED_WIDTHS,
  getImageVariant,
  imageSrcSet,
  parseImageParams,
} from "@/lib/media-variants";
import { GET as mediaGET } from "@/app/media/[id]/route";
import { GET as assetGET } from "@/app/theme-assets/[themeId]/[version]/[...path]/route";
import { getInstalledTheme } from "@/lib/themes/registry";
import { installBuiltIns, resetDatabase } from "../helpers/db";
import { tmpDir } from "../helpers/tmp";

let dir: string;
let big: string; // 2000x1200 jpeg
let small: string; // 500x300 png
let gif: string;

const widthOf = async (buf: Buffer) => (await sharp(buf).metadata()).width;
const bufOf = (v: Awaited<ReturnType<typeof getImageVariant>>) =>
  v.buffer ?? fs.readFileSync(v.path!);

beforeAll(async () => {
  dir = tmpDir("cms-img-");
  const noise = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 60 } } });
  big = path.join(dir, "big.jpg");
  small = path.join(dir, "small.png");
  gif = path.join(dir, "anim.gif");
  await noise(2000, 1200).jpeg().toFile(big);
  await noise(500, 300).png().toFile(small);
  const frame = (r: number) => Buffer.alloc(40 * 40 * 3, 0).map((_, i) => (i % 3 === 0 ? r : 80));
  const two = Buffer.concat([frame(255), frame(10)]);
  await sharp(two, { raw: { width: 40, height: 80, channels: 3, pageHeight: 40 } })
    .gif({ loop: 0, delay: [100, 100] })
    .toFile(gif);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("parseImageParams / imageSrcSet", () => {
  it("ignores invalid values", () => {
    for (const w of ["abc", "-5", "0", "", "99999999"]) {
      expect(parseImageParams(new URLSearchParams({ w })).width).toBeUndefined();
    }
    expect(parseImageParams(new URLSearchParams()).width).toBeUndefined();
    expect(parseImageParams(new URLSearchParams({ w: "480" })).width).toBe(480);
    expect(parseImageParams(new URLSearchParams({ format: "bogus" })).format).toBe("webp");
  });
  it("builds a srcset from the whitelist", () => {
    expect(imageSrcSet("/media/x")).toBe(
      ALLOWED_WIDTHS.map((w) => `/media/x?w=${w} ${w}w`).join(", ")
    );
    expect(imageSrcSet("/media/x?a=1", [480])).toBe("/media/x?a=1&w=480 480w");
    expect(ALLOWED_WIDTHS).toEqual([320, 480, 640, 800, 1024, 1280, 1600]);
  });
});

describe("getImageVariant", () => {
  it("snaps to the nearest allowed width at or above the request, as webp", async () => {
    const cases: [number, number][] = [
      [1, 320],
      [320, 320],
      [321, 480],
      [481, 640],
      [700, 800],
      [1025, 1280],
      [1500, 1600],
      [9999, 1600],
    ];
    for (const [req, expected] of cases) {
      const v = await getImageVariant(big, { width: req });
      expect(v.contentType).toBe("image/webp");
      expect(await widthOf(bufOf(v))).toBe(expected);
    }
  });
  it("never upscales", async () => {
    const v = await getImageVariant(small, { width: 1280 });
    expect(await widthOf(bufOf(v))).toBe(500);
    const noWidth = await getImageVariant(small, {});
    expect(await widthOf(bufOf(noWidth))).toBe(500);
    expect(noWidth.contentType).toBe("image/webp");
  });
  it("caches on disk and gives a stable ETag that changes with the file", async () => {
    const file = path.join(dir, "change.jpg");
    await sharp({ create: { width: 900, height: 600, channels: 3, background: "#123456" } })
      .jpeg()
      .toFile(file);
    const a = await getImageVariant(file, { width: 480 });
    const b = await getImageVariant(file, { width: 480 });
    expect(b.etag).toBe(a.etag);
    expect(Buffer.compare(bufOf(a), bufOf(b))).toBe(0);
    expect(a.etag).not.toBe((await getImageVariant(file, { width: 640 })).etag);
    const cacheDir = path.join(process.env.CMS_DATA_DIR!, "cache", "images");
    expect(fs.readdirSync(cacheDir).some((f) => a.etag.includes(f.replace(".webp", "")))).toBe(
      true
    );

    await sharp({ create: { width: 900, height: 600, channels: 3, background: "#abcdef" } })
      .jpeg()
      .toFile(file);
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    const c = await getImageVariant(file, { width: 480 });
    expect(c.etag).not.toBe(a.etag);
  });
  it("returns the original untouched for animated GIFs and format=original", async () => {
    const v = await getImageVariant(gif, { width: 320 });
    expect(v.path).toBe(gif);
    expect(v.buffer).toBeUndefined();
    expect(v.contentType).toBe("image/gif");
    const o = await getImageVariant(big, { width: 320, format: "original" });
    expect(o.path).toBe(big);
    expect(o.contentType).toBe("image/jpeg");
  });
  it("refuses traversal, relative, missing and directory paths", async () => {
    await expect(getImageVariant(path.join(dir, "..", "x.jpg"), { width: 320 })).rejects.toThrow();
    await expect(getImageVariant(`${dir}/a/../big.jpg`, { width: 320 })).rejects.toThrow();
    await expect(getImageVariant("big.jpg", { width: 320 })).rejects.toThrow();
    await expect(getImageVariant(path.join(dir, "nope.jpg"), {})).rejects.toThrow();
    await expect(getImageVariant(dir, {})).rejects.toThrow();
  });
});

describe("/media/[id] with ?w=", () => {
  let id: string;
  beforeEach(async () => {
    await resetDatabase();
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const filename = "a".repeat(32) + ".jpg";
    fs.copyFileSync(big, path.join(MEDIA_DIR, filename));
    const row = await prisma.media.create({
      data: { filename, mimeType: "image/jpeg", byteSize: 1, width: 2000, height: 1200 },
    });
    id = row.id;
  });
  const get = (qs: string, headers: Record<string, string> = {}) =>
    mediaGET(new Request(`http://localhost/media/${id}${qs}`, { headers }), {
      params: Promise.resolve({ id }),
    });

  it("serves webp to clients that accept it, the original otherwise", async () => {
    const webp = await get("?w=480", { accept: "image/avif,image/webp,*/*" });
    expect(webp.status).toBe(200);
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect(await widthOf(Buffer.from(await webp.arrayBuffer()))).toBe(480);
    expect(webp.headers.get("vary") ?? "").toContain("Accept");

    const plain = await get("?w=480", { accept: "image/png,*/*" });
    expect(plain.status).toBe(200);
    expect(plain.headers.get("content-type")).toBe("image/jpeg");
    expect(await widthOf(Buffer.from(await plain.arrayBuffer()))).toBe(2000);
  });
  it("serves the untouched original without ?w=", async () => {
    const res = await get("", { accept: "image/webp" });
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(fs.statSync(big).size);
  });
  it("ignores an invalid ?w=", async () => {
    const res = await get("?w=abc", { accept: "image/webp" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
  it("is immutable and answers If-None-Match with 304", async () => {
    const first = await get("?w=640", { accept: "image/webp" });
    expect(first.headers.get("cache-control")).toContain("immutable");
    const etag = first.headers.get("etag")!;
    expect(etag).toBeTruthy();
    const again = await get("?w=640", { accept: "image/webp", "if-none-match": etag });
    expect(again.status).toBe(304);
    const other = await get("?w=480", { accept: "image/webp", "if-none-match": etag });
    expect(other.status).toBe(200);

    const orig = await get("");
    const oetag = orig.headers.get("etag")!;
    expect((await get("", { "if-none-match": oetag })).status).toBe(304);
  });
  it("still 404s for bad ids", async () => {
    const res = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ id: "../etc" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("/theme-assets with ?w=", () => {
  beforeEach(async () => {
    await resetDatabase();
    await installBuiltIns();
  });
  const params = (version: string, segs: string[]) => ({
    params: Promise.resolve({ themeId: "default", version, path: segs }),
  });

  it("resizes theme images by Accept and supports 304", async () => {
    const version = (await getInstalledTheme("default"))!.version;
    const url = "http://localhost/theme-assets/default/x/assets/thumbnail.jpg?w=320";
    const webp = await assetGET(
      new Request(url, { headers: { accept: "image/webp" } }),
      params(version, ["assets", "thumbnail.jpg"])
    );
    expect(webp.status).toBe(200);
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect(webp.headers.get("cache-control")).toContain("immutable");
    const etag = webp.headers.get("etag")!;
    const cached = await assetGET(
      new Request(url, { headers: { accept: "image/webp", "if-none-match": etag } }),
      params(version, ["assets", "thumbnail.jpg"])
    );
    expect(cached.status).toBe(304);
    const plain = await assetGET(new Request(url), params(version, ["assets", "thumbnail.jpg"]));
    expect(plain.headers.get("content-type")).toBe("image/jpeg");
  });
  it("keeps path validation: traversal, hidden files and manifests are 404", async () => {
    const version = (await getInstalledTheme("default"))!.version;
    for (const segs of [
      ["..", "..", "cms.db"],
      [".secret.key"],
      ["theme.json"],
      ["assets", "..", "theme.json"],
    ]) {
      const res = await assetGET(new Request("http://x?w=320"), params(version, segs));
      expect(res.status).toBe(404);
    }
  });
});
