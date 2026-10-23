import { slugify } from "@/lib/content/slug";

export type Heading = { id: string; text: string };

const HEADING = /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Gives every h2 and h3 of an already sanitized article an id, and lists the h2 headings so a theme can
 * draw a table of contents. Ids come from the heading text (letters and digits only), made unique with
 * a number, so they are safe to put in an attribute and a link.
 */
export function withHeadingIds(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();
  const out = html.replace(HEADING, (_whole, level: string, attrs: string | undefined, inner) => {
    const text = plain(inner);
    const base = slugify(text) || "muc";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    if (level === "2" && text) headings.push({ id, text });
    const rest = (attrs ?? "").replace(/\sid\s*=\s*("[^"]*"|'[^']*')/i, "");
    return `<h${level}${rest} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, headings };
}
