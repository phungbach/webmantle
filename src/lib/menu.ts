import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSiteSetting } from "@/lib/settings";
import { fromZod } from "@/lib/errors";

/**
 * The site menu set in Appearance → Menu. It replaces the theme's own navigation links when it has
 * items. Two levels only: top-level links, and child links shown in a dropdown.
 */

export const MENU_KEY = "menuItems";
export const MENU_MAX_TOP = 12;
export const MENU_MAX_CHILDREN = 8;
/** Rows in the editor, which is also the most entries that can be saved (top and child together). */
export const MENU_ROWS = 40;

// Same rule as theme links: an internal path or an http(s) address. No javascript: or protocol-relative URLs.
const href = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//.test(v),
    "Use a path that starts with / or an http(s) address"
  );
const label = z.string().trim().min(1, "Every menu item needs a name").max(60);
const link = z.object({ label, href });

export const menuSchema = z
  .array(link.extend({ children: z.array(link).max(MENU_MAX_CHILDREN) }))
  .max(MENU_MAX_TOP);
export type MenuItem = z.infer<typeof menuSchema>[number];

/** Stored menu, or an empty list (meaning "use the theme's own links"). Bad data is ignored. */
export async function getSiteMenu(): Promise<MenuItem[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: MENU_KEY } });
  if (!row?.value) return [];
  try {
    const parsed = menuSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveSiteMenu(items: MenuItem[]) {
  const parsed = menuSchema.safeParse(items);
  if (!parsed.success) throw fromZod(parsed.error);
  await setSiteSetting(MENU_KEY, parsed.data.length ? JSON.stringify(parsed.data) : "");
}

export type MenuRow = { label: string; href: string; child: boolean };

/**
 * Turns the editor rows into a tree, in row order. A child row directly under a top-level row
 * becomes its child. A child row with nothing above it becomes top-level. Empty rows are skipped.
 */
export function rowsToMenu(rows: MenuRow[]): MenuItem[] {
  const items: MenuItem[] = [];
  for (const row of rows) {
    const entry = { label: row.label.trim(), href: row.href.trim() };
    if (!entry.label && !entry.href) continue;
    const parent = items[items.length - 1];
    if (row.child && parent) parent.children.push(entry);
    else items.push({ ...entry, children: [] });
  }
  return items;
}

/** Flattens a saved menu into editor rows, with spare empty rows at the end. */
export function menuToRows(items: MenuItem[], spare = 4): MenuRow[] {
  const rows: MenuRow[] = [];
  for (const item of items) {
    rows.push({ label: item.label, href: item.href, child: false });
    for (const child of item.children)
      rows.push({ label: child.label, href: child.href, child: true });
  }
  for (let i = 0; i < spare && rows.length < MENU_ROWS; i++) {
    rows.push({ label: "", href: "", child: false });
  }
  return rows;
}
