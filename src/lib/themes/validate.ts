import { checkThemeContent } from "@/lib/themes/content-schemas";
import { checkThemePages } from "@/lib/themes/page-schemas";
import { checkThemeCategories, checkThemePosts, checkThemeTags } from "@/lib/themes/post-schemas";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED_ASSET_EXTENSIONS,
  CMS_VERSION,
  COMPONENT_PROPS,
  compareSemver,
  isAllowedThemeFile,
  LIMITS,
  manifestSchema,
  REQUIRED_TEMPLATES,
  templateFileSchema,
  type LayoutNode,
  type Manifest,
} from "@/lib/themes/contract";
import { findSymlinks } from "@/lib/themes/zip";

export type ValidationIssue = { code: string; file?: string; message: string };
export type ValidationReport = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: string[];
  manifest: Manifest | null;
  files: string[];
};

const FORBIDDEN_CSS = [
  { pattern: /@import/i, label: "@import" },
  { pattern: /expression\s*\(/i, label: "CSS expression()" },
  // Only the legacy IE `behavior` property. `scroll-behavior` and similar names are ordinary CSS.
  { pattern: /(?<![\w-])behaviou?r\s*:/i, label: "behavior property" },
  { pattern: /-moz-binding/i, label: "-moz-binding" },
  { pattern: /javascript\s*:/i, label: "javascript: URL" },
  { pattern: /<\s*\/?\s*(script|style|iframe|object|embed)/i, label: "HTML markup" },
];

/** Recursively lists regular files as POSIX-style relative paths. Symlinks are reported separately. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

/** Checks every url() in a stylesheet. Only theme-local assets with allowed extensions are permitted. */
function checkCssUrls(css: string, files: Set<string>, errors: ValidationIssue[]) {
  const urlPattern = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
  for (const match of css.matchAll(urlPattern)) {
    const target = match[2] ?? "";
    const normalized = target.replace(/^\.\//, "");
    const allowedShape =
      /^assets\/[A-Za-z0-9._/-]+$/.test(normalized) && !normalized.includes("..");
    const ext = path.extname(normalized).toLowerCase();
    if (
      !allowedShape ||
      !ALLOWED_ASSET_EXTENSIONS.includes(ext as (typeof ALLOWED_ASSET_EXTENSIONS)[number])
    ) {
      errors.push({
        code: "css-url",
        file: "styles.css",
        message: `url() may only reference assets/ files: ${target.slice(0, 80)}`,
      });
    } else if (!files.has(normalized)) {
      errors.push({
        code: "css-missing-asset",
        file: "styles.css",
        message: `url() references a missing file: ${normalized}`,
      });
    }
  }
}

function countNodes(node: LayoutNode, depth: number, state: { nodes: number; maxDepth: number }) {
  state.nodes += 1;
  state.maxDepth = Math.max(state.maxDepth, depth);
  for (const child of node.children ?? []) countNodes(child, depth + 1, state);
}

/**
 * Validates an extracted theme directory against the contract.
 * Never throws for invalid content: all problems are returned in the report so the admin can see them.
 * Error messages use relative file names only, never absolute server paths.
 */
export function validateThemeDirectory(dir: string): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: string[] = [];
  const report = (manifest: Manifest | null, files: string[]): ValidationReport => ({
    ok: errors.length === 0,
    errors,
    warnings,
    manifest,
    files,
  });

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    errors.push({ code: "missing-root", message: "Theme directory does not exist" });
    return report(null, []);
  }

  const symlinks = findSymlinks(dir);
  if (symlinks.length > 0) {
    errors.push({
      code: "symlink",
      message: `Symbolic links are not allowed (${symlinks.length} found)`,
    });
    return report(null, []);
  }

  const files = listFiles(dir);
  const fileSet = new Set(files);

  for (const file of files) {
    if (!isAllowedThemeFile(file)) {
      errors.push({
        code: "file-type",
        file,
        message: "File type or location is not allowed in a theme",
      });
    }
    const stat = fs.statSync(path.join(dir, file));
    if (stat.size > LIMITS.entryUncompressedBytes) {
      errors.push({ code: "file-size", file, message: "File is larger than 3 MB" });
    }
  }

  // theme.json
  let manifest: Manifest | null = null;
  if (!fileSet.has("theme.json")) {
    errors.push({
      code: "missing-manifest",
      file: "theme.json",
      message: "theme.json is required",
    });
  } else {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8"));
    } catch {
      errors.push({
        code: "manifest-json",
        file: "theme.json",
        message: "theme.json is not valid JSON",
      });
      return report(null, files);
    }
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          code: "manifest",
          file: "theme.json",
          message: `${issue.path.join(".") || "manifest"}: ${issue.message}`,
        });
      }
    } else {
      manifest = parsed.data;
    }
  }

  if (manifest) {
    if (compareSemver(manifest.minimumCmsVersion, CMS_VERSION) > 0) {
      errors.push({
        code: "cms-version",
        file: "theme.json",
        message: `Requires CMS ${manifest.minimumCmsVersion} or newer (this is ${CMS_VERSION})`,
      });
    }

    for (const required of REQUIRED_TEMPLATES) {
      if (!fileSet.has(`templates/${required}.json`)) {
        errors.push({
          code: "missing-template",
          file: `templates/${required}.json`,
          message: `Required template "${required}" is missing`,
        });
      }
    }
    for (const declared of manifest.supportedTemplates) {
      if (!fileSet.has(`templates/${declared}.json`)) {
        errors.push({
          code: "missing-template",
          file: `templates/${declared}.json`,
          message: `Declared template "${declared}" is missing`,
        });
      }
    }
    // Custom templates: every declared one must exist, and no file may be undeclared.
    const customIds = manifest.customTemplates.map((t) => t.id);
    for (const id of customIds) {
      if (!fileSet.has(`templates/${id}.json`)) {
        errors.push({
          code: "missing-template",
          file: `templates/${id}.json`,
          message: `Declared custom template "${id}" is missing`,
        });
      }
    }
    const declared = new Set<string>([...manifest.supportedTemplates, ...customIds]);
    for (const file of files.filter((f) => f.startsWith("templates/"))) {
      const name = file.replace(/^templates\//, "").replace(/\.json$/, "");
      if (!declared.has(name)) {
        errors.push({
          code: "unknown-template",
          file,
          message: "Template file is not declared in supportedTemplates or customTemplates",
        });
      }
    }

    for (const template of [...manifest.supportedTemplates, ...customIds]) {
      const rel = `templates/${template}.json`;
      if (!fileSet.has(rel)) continue;
      validateTemplate(path.join(dir, rel), rel, errors);
    }

    for (const asset of manifest.assets) {
      if (!fileSet.has(asset))
        errors.push({ code: "missing-asset", file: asset, message: "Declared asset is missing" });
    }
    if (manifest.thumbnail) {
      if (!fileSet.has(manifest.thumbnail)) {
        errors.push({
          code: "missing-thumbnail",
          file: manifest.thumbnail,
          message: "The thumbnail named in theme.json is missing",
        });
      } else if (fs.statSync(path.join(dir, manifest.thumbnail)).size > LIMITS.thumbnailBytes) {
        errors.push({
          code: "thumbnail-size",
          file: manifest.thumbnail,
          message: `The thumbnail is larger than ${LIMITS.thumbnailBytes / 1024} KB`,
        });
      }
    }

    if (!fileSet.has("styles.css")) {
      errors.push({
        code: "missing-styles",
        file: "styles.css",
        message: "styles.css is required",
      });
    }
    if (!fileSet.has("README.md"))
      warnings.push("README.md is missing; documentation for the theme is recommended");
  }

  for (const file of [
    "content.json",
    ...files.filter((f) => /^content\.[a-z]{2}\.json$/.test(f)),
  ]) {
    if (!fileSet.has(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const problem of checkThemeContent(raw)) {
        errors.push({ code: "content", file, message: problem.replace("content.json", file) });
      }
    } catch {
      errors.push({ code: "content-json", file, message: `${file} is not valid JSON` });
    }
  }

  if (fileSet.has("pages.json")) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, "pages.json"), "utf8"));
      const pageTemplates = new Set(
        (manifest?.customTemplates ?? [])
          .filter((t) => t.appliesTo.includes("page"))
          .map((t) => t.id)
      );
      for (const problem of checkThemePages(raw, pageTemplates)) {
        errors.push({ code: "pages", file: "pages.json", message: problem });
      }
    } catch {
      errors.push({
        code: "pages-json",
        file: "pages.json",
        message: "pages.json is not valid JSON",
      });
    }
  }

  let categorySlugs = new Set<string>();
  let tagSlugs = new Set<string>();
  for (const [file, check] of [
    [
      "categories.json",
      (raw: unknown) => {
        categorySlugs = new Set(
          Array.isArray(raw) ? raw.map((c) => String((c as { slug?: unknown })?.slug)) : []
        );
        return checkThemeCategories(raw);
      },
    ],
    [
      "tags.json",
      (raw: unknown) => {
        tagSlugs = new Set(
          Array.isArray(raw) ? raw.map((c) => String((c as { slug?: unknown })?.slug)) : []
        );
        return checkThemeTags(raw);
      },
    ],
    [
      "posts.json",
      (raw: unknown) => [
        ...checkThemePosts(raw, categorySlugs, tagSlugs),
        ...(Array.isArray(raw) ? raw : [])
          .map((p) => String((p as { image?: unknown })?.image ?? ""))
          .filter((image) => image && !fileSet.has(image))
          .map((image) => `posts.json: image "${image}" is not in the theme`),
      ],
    ],
  ] as const) {
    if (!fileSet.has(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const problem of check(raw))
        errors.push({ code: "theme-content", file, message: problem });
    } catch {
      errors.push({ code: "theme-content-json", file, message: `${file} is not valid JSON` });
    }
  }

  if (fileSet.has("styles.css")) {
    const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
    if (Buffer.byteLength(css) > 200 * 1024)
      errors.push({
        code: "css-size",
        file: "styles.css",
        message: "styles.css is larger than 200 KB",
      });
    for (const { pattern, label } of FORBIDDEN_CSS) {
      if (pattern.test(css))
        errors.push({
          code: "css-forbidden",
          file: "styles.css",
          message: `Forbidden construct: ${label}`,
        });
    }
    checkCssUrls(css, fileSet, errors);
  }

  return report(errors.length === 0 ? manifest : null, files);
}

function validateTemplate(absolutePath: string, rel: string, errors: ValidationIssue[]) {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch {
    errors.push({ code: "template-json", file: rel, message: "Template is not valid JSON" });
    return;
  }
  const parsed = templateFileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 5)) {
      errors.push({
        code: "template",
        file: rel,
        message: `${issue.path.join(".") || "template"}: ${issue.message}`,
      });
    }
    return;
  }

  const state = { nodes: 0, maxDepth: 0 };
  countNodes(parsed.data.root, 1, state);
  if (state.nodes > LIMITS.maxLayoutNodes)
    errors.push({ code: "template-size", file: rel, message: "Template has too many nodes" });
  if (state.maxDepth > LIMITS.maxLayoutDepth)
    errors.push({ code: "template-depth", file: rel, message: "Template is nested too deeply" });

  const checkProps = (node: LayoutNode, trail: string) => {
    const props = COMPONENT_PROPS[node.component].safeParse(node.props ?? {});
    if (!props.success) {
      const first = props.error.issues[0];
      errors.push({
        code: "component-props",
        file: rel,
        message: `${trail}${node.component}: ${first?.path.join(".") ?? "props"} ${first?.message ?? "invalid"}`,
      });
    }
    for (const child of node.children ?? []) checkProps(child, `${trail}${node.component} > `);
  };
  checkProps(parsed.data.root, "");
}

/** Used by the activation path to confirm the theme still matches its manifest before it goes live. */
export function readManifestOrThrow(dir: string): Manifest {
  const report = validateThemeDirectory(dir);
  if (!report.ok || !report.manifest) {
    throw new Error(`Theme is invalid: ${report.errors.map((e) => e.message).join("; ")}`);
  }
  return report.manifest;
}
