import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildZip, zipDirectory } from "../helpers/zip-builder";
import { tmpDir } from "../helpers/tmp";
import { extractThemeArchive, ArchiveError } from "@/lib/themes/zip";
import { themeDir } from "../helpers/db";

async function extractCode(buffer: Buffer): Promise<string | null> {
  const dest = tmpDir("zip-");
  try {
    await extractThemeArchive(buffer, dest);
    return null;
  } catch (error) {
    return error instanceof ArchiveError ? error.code : "unexpected";
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}

const minimalTheme = (overrides: Record<string, Buffer> = {}) => [
  { name: "theme.json", data: Buffer.from("{}") },
  { name: "styles.css", data: Buffer.from("") },
  ...Object.entries(overrides).map(([name, data]) => ({ name, data })),
];

describe("theme ZIP extraction", () => {
  it("extracts a real built-in theme archive", async () => {
    const dest = tmpDir("zip-ok-");
    const buffer = zipDirectory(themeDir("starter"));
    const files = await extractThemeArchive(buffer, dest);
    expect(files).toContain("theme.json");
    expect(files).toContain("templates/home.json");
    expect(fs.existsSync(path.join(dest, "styles.css"))).toBe(true);
    fs.rmSync(dest, { recursive: true, force: true });
  });

  it("rejects non-ZIP data", async () => {
    expect(await extractCode(Buffer.from("<html>not a zip</html>"))).toBe("format");
  });

  it("rejects path traversal", async () => {
    expect(await extractCode(buildZip(minimalTheme({ "../../evil.txt": Buffer.from("x") })))).toBe(
      "path"
    );
  });

  it("rejects absolute paths", async () => {
    expect(await extractCode(buildZip(minimalTheme({ "/etc/passwd": Buffer.from("x") })))).toBe(
      "path"
    );
  });

  it("rejects backslash path tricks", async () => {
    expect(await extractCode(buildZip(minimalTheme({ "..\\evil.txt": Buffer.from("x") })))).toBe(
      "path"
    );
  });

  it("rejects symbolic links", async () => {
    const zip = buildZip([
      { name: "theme.json", data: Buffer.from("{}") },
      { name: "assets/link.png", symlinkTarget: "/etc/passwd" },
    ]);
    expect(await extractCode(zip)).toBe("symlink");
  });

  it("rejects executable and script files", async () => {
    expect(
      await extractCode(buildZip(minimalTheme({ "templates/home.js": Buffer.from("x") })))
    ).toBe("type");
    expect(await extractCode(buildZip(minimalTheme({ "assets/run.sh": Buffer.from("x") })))).toBe(
      "type"
    );
  });

  it("rejects hidden files", async () => {
    expect(await extractCode(buildZip(minimalTheme({ ".env": Buffer.from("SECRET=1") })))).toBe(
      "hidden"
    );
  });

  it("rejects duplicate names that differ only by case", async () => {
    const zip = buildZip([
      { name: "theme.json", data: Buffer.from("{}") },
      { name: "Theme.json", data: Buffer.from("{}") },
    ]);
    expect(await extractCode(zip)).toBe("duplicate");
  });

  it("rejects archive bombs by compression ratio", async () => {
    const bomb = Buffer.alloc(2_500_000); // zeros compress to a few kilobytes
    const zip = buildZip([{ name: "styles.css", data: bomb, deflate: true }]);
    expect(await extractCode(zip)).toBe("bomb");
  });

  it("rejects archives that declare an oversized entry", async () => {
    const big = Buffer.alloc(3_500_000, 0x61);
    expect(await extractCode(buildZip([{ name: "styles.css", data: big }]))).toBe("limits");
  });

  it("rejects too many entries", async () => {
    const entries = Array.from({ length: 301 }, (_, i) => ({
      name: `assets/f${i}.png`,
      data: Buffer.from("x"),
    }));
    expect(await extractCode(buildZip(entries))).toBe("limits");
  });
});
