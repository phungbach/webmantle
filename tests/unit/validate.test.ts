import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateThemeDirectory } from "@/lib/themes/validate";
import { copyDir, tmpDir } from "../helpers/tmp";
import { ROOT, themeDir } from "../helpers/db";

const dirs: string[] = [];
function fresh(source = "starter"): string {
  const dir = copyDir(themeDir(source), path.join(tmpDir("theme-"), "t"));
  dirs.push(path.dirname(dir));
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

type Json = Record<string, unknown>;

function editJson(dir: string, file: string, change: (obj: Json) => void) {
  const full = path.join(dir, file);
  const obj: Json = JSON.parse(fs.readFileSync(full, "utf8"));
  change(obj);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2));
}

const codes = (dir: string) =>
  validateThemeDirectory(dir).errors.map((e) => `${e.code}:${e.file ?? ""}`);

describe("theme validation", () => {
  it("accepts both built-in themes", () => {
    for (const id of ["default", "starter"]) {
      const report = validateThemeDirectory(themeDir(id));
      expect(report.errors, id).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.manifest?.id).toBe(id);
    }
  });

  it("rejects a manifest with an invalid id", () => {
    const dir = fresh();
    editJson(dir, "theme.json", (m) => (m.id = "Bad Id!"));
    expect(codes(dir).some((c) => c.startsWith("manifest"))).toBe(true);
  });

  it("requires every required template", () => {
    const dir = fresh();
    fs.rmSync(path.join(dir, "templates", "search.json"));
    expect(codes(dir)).toContain("missing-template:templates/search.json");
  });

  it("rejects a template that references an unknown component", () => {
    const dir = fresh();
    fs.writeFileSync(
      path.join(dir, "templates", "home.json"),
      JSON.stringify({
        contractVersion: 1,
        root: { component: "RawHtml", props: { html: "<script>alert(1)</script>" } },
      })
    );
    const report = validateThemeDirectory(dir);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.file === "templates/home.json")).toBe(true);
  });

  it("rejects unknown props on a known component", () => {
    const dir = fresh();
    fs.writeFileSync(
      path.join(dir, "templates", "home.json"),
      JSON.stringify({
        contractVersion: 1,
        root: { component: "PostList", props: { limit: 9999 } },
      })
    );
    expect(validateThemeDirectory(dir).errors.some((e) => e.code === "component-props")).toBe(true);
  });

  it("rejects an unknown template file", () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, "templates", "checkout.json"), "{}");
    expect(codes(dir)).toContain("unknown-template:templates/checkout.json");
  });

  it("accepts scroll-behavior while still rejecting the legacy behavior property", () => {
    const ok = fresh();
    fs.writeFileSync(path.join(ok, "styles.css"), "html{scroll-behavior:smooth}");
    expect(validateThemeDirectory(ok).errors.some((e) => e.code === "css-forbidden")).toBe(false);
    const bad = fresh();
    fs.writeFileSync(path.join(bad, "styles.css"), "a{color:red;behavior:url(x.htc)}");
    expect(validateThemeDirectory(bad).errors.some((e) => e.code === "css-forbidden")).toBe(true);
  });

  it("rejects forbidden CSS constructs", () => {
    for (const css of [
      "@import url(https://evil.example/x.css);",
      "body{background:url(https://evil.example/x.png)}",
      "a{x:expression(alert(1))}",
      "a{behavior:url(x.htc)}",
      "a{b:javascript:alert(1)}",
    ]) {
      const dir = fresh();
      fs.writeFileSync(path.join(dir, "styles.css"), css);
      const report = validateThemeDirectory(dir);
      expect(report.ok, css).toBe(false);
      expect(
        report.errors.some((e) => e.code === "css-url" || e.code === "css-forbidden"),
        css
      ).toBe(true);
    }
  });

  it("allows url() only for theme-local assets that exist", () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, "styles.css"), "a{b:url(assets/missing.png)}");
    expect(codes(dir)).toContain("css-missing-asset:styles.css");
  });

  it("rejects declared tokens that try to break out of a CSS declaration", () => {
    const dir = fresh();
    editJson(
      dir,
      "theme.json",
      (m) => ((m.tokens as Record<string, string>)["color-bg"] = "red;}body{display:none")
    );
    expect(validateThemeDirectory(dir).ok).toBe(false);
  });

  it("refuses themes that need a newer CMS", () => {
    const dir = fresh();
    editJson(dir, "theme.json", (m) => (m.minimumCmsVersion = "9.0.0"));
    expect(codes(dir)).toContain("cms-version:theme.json");
  });

  it("rejects a file that is not on the allow-list", () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, "assets-script.js"), "alert(1)");
    expect(codes(dir)).toContain("file-type:assets-script.js");
  });

  it("rejects SVG images, which can contain script", () => {
    const dir = fresh();
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "logo.svg"), "<svg onload=alert(1)/>");
    expect(codes(dir).some((c) => c.startsWith("file-type:assets/logo.svg"))).toBe(true);
  });

  it("rejects symbolic links found on disk", () => {
    const dir = fresh();
    fs.symlinkSync("/etc/passwd", path.join(dir, "assets-link"));
    const report = validateThemeDirectory(dir);
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.code).toBe("symlink");
  });

  it("never includes absolute paths in its messages", () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, "templates", "home.json"), "{not json");
    const report = validateThemeDirectory(dir);
    const text = JSON.stringify(report.errors);
    expect(text.includes(dir)).toBe(false);
    expect(text.includes(ROOT)).toBe(false);
  });
});
