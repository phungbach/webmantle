import { htmlToText, wordCount } from "@/lib/seo/text";

// Reads the structure of sanitized post HTML. The sanitizer only allows a small set of tags, so
// a small tag reader is enough here. Input must already be sanitized (it always is when saved).

export type ParsedContent = {
  headings: { level: number; text: string }[];
  paragraphs: string[];
  links: string[];
  images: { src: string; alt: string | null }[];
  text: string;
  words: number;
};

function attr(attributes: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(` ${attributes}`);
  return match ? match[1]! : null;
}

export function parseContent(html: string): ParsedContent {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: htmlToText(m[2] ?? ""),
  }));
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => htmlToText(m[1] ?? ""))
    .filter(Boolean);
  const links = [...html.matchAll(/<a\b([^>]*)>/gi)]
    .map((m) => attr(m[1] ?? "", "href"))
    .filter((href): href is string => !!href);
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)].map((m) => ({
    src: attr(m[1] ?? "", "src") ?? "",
    alt: attr(m[1] ?? "", "alt"),
  }));
  const text = htmlToText(html);
  return { headings, paragraphs, links, images, text, words: wordCount(text) };
}
