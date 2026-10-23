import sanitizeHtml from "sanitize-html";

const VIDEO_SRC = /^\/videos\/[a-z0-9-]+\.mp4$/;
const VIDEO_POSTER = /^\/videos\/[a-z0-9-]+\.jpg$/;

// Allow-list for rich content written by editors. Scripts, event handlers, iframes and
// javascript: URLs are removed. Only http(s), mailto and relative links are kept.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "h2",
    "h3",
    "h4",
    "strong",
    "em",
    "u",
    "s",
    "blockquote",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "hr",
    "figure",
    "figcaption",
    "video",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "width", "height", "loading"],
    video: ["src", "poster", "controls", "preload", "playsinline", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow",
      },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: "lazy" },
    }),
    // Guide videos live in /public/videos. Only those same-site files are kept, and the player always
    // shows its controls and does not download anything until the visitor presses play.
    video: (tagName, attribs) => {
      const src: string = VIDEO_SRC.test(attribs.src ?? "") ? (attribs.src ?? "") : "";
      const poster: string = VIDEO_POSTER.test(attribs.poster ?? "") ? (attribs.poster ?? "") : "";
      return {
        tagName,
        attribs: {
          src,
          ...(poster ? { poster } : {}),
          controls: "controls",
          preload: "none",
          playsinline: "playsinline",
          ...(attribs.width ? { width: attribs.width } : {}),
          ...(attribs.height ? { height: attribs.height } : {}),
        },
      };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "video" && !frame.attribs.src,
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** Plain-text variant for excerpts, meta descriptions and feeds. */
export function stripToText(html: string, maxLength = 200): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
