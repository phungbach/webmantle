const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "preview",
  "theme-assets",
  "uploads",
  "search",
  "login",
  "feed",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= 1 && slug.length <= 80 && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug)
  );
}
