import { describe, expect, it } from "vitest";
import { en, vi } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, intlLocale, isLocale, pluralKey, t, tr } from "@/lib/i18n";

describe("translations", () => {
  it("uses Vietnamese as the default language", () => {
    expect(DEFAULT_LOCALE).toBe("vi");
    expect(t(undefined, "nav.home")).toBe("Trang chủ");
    expect(t("xx", "nav.home")).toBe("Trang chủ");
  });

  it("returns English when the visitor chose it", () => {
    expect(t("en", "nav.home")).toBe("Home");
    expect(t("en", "post.readMore")).toBe("Read more");
  });

  it("has an English text for every Vietnamese key, and none is empty", () => {
    const keys = Object.keys(vi) as (keyof typeof vi)[];
    for (const key of keys) {
      expect(en[key], key).toBeTruthy();
      expect(vi[key], key).toBeTruthy();
    }
    expect(Object.keys(en).sort()).toEqual(keys.sort());
  });

  it("fills placeholders", () => {
    expect(t("vi", "footer.copy", { year: 2026, title: "Nhật ký" })).toBe("© 2026 Nhật ký");
    expect(t("en", "pagination.status", { current: 2, total: 5 })).toBe("Page 2 of 5");
  });

  it("chooses singular or plural keys by count", () => {
    expect(pluralKey("post.count", 1)).toBe("post.count.one");
    expect(pluralKey("post.count", 0)).toBe("post.count.other");
    expect(t("en", pluralKey("post.count", 3), { count: 3 })).toBe("3 posts");
    expect(t("vi", pluralKey("post.count", 3), { count: 3 })).toBe("3 bài viết");
  });

  it("recognises supported locales only", () => {
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("maps locales to date formats", () => {
    expect(intlLocale("vi")).toBe("vi-VN");
    expect(intlLocale("en")).toBe("en-US");
  });

  it("gives a translator bound to one locale", () => {
    const T = tr("en");
    expect(T("common.save")).toBe("Save");
    expect(tr("vi")("common.save")).toBe("Lưu");
  });
});
