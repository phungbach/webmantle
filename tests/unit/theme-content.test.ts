import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkThemeContent } from "@/lib/themes/content-schemas";
import { ROOT } from "../helpers/db";

const shipped = JSON.parse(
  fs.readFileSync(path.join(ROOT, "themes", "hien-studio", "content.json"), "utf8")
);

describe("theme content.json", () => {
  it("accepts the content shipped with the Hiên Studio theme", () => {
    expect(checkThemeContent(shipped)).toEqual([]);
  });

  it("refuses a pricing table without plans", () => {
    expect(checkThemeContent({ vps: { title: "x", plans: [] } }).length).toBeGreaterThan(0);
  });

  it("refuses links that are not internal paths or http(s) addresses", () => {
    const bad = { cta: { title: "x", button: "y", href: "javascript:alert(1)" } };
    expect(checkThemeContent(bad).length).toBeGreaterThan(0);
    const badNav = { nav: [{ label: "x", href: "//evil.example" }] };
    expect(checkThemeContent(badNav).length).toBeGreaterThan(0);
  });

  it("refuses block names that are not plain lowercase words", () => {
    expect(checkThemeContent({ "Bad-Name": [] }).length).toBeGreaterThan(0);
  });

  it("requires an object at the top level", () => {
    expect(checkThemeContent([])).not.toEqual([]);
    expect(checkThemeContent("text")).not.toEqual([]);
  });
});
