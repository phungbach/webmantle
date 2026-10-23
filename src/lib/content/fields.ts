// Short facts kept with a post. For a project they are the type, area, schedule and price shown on
// the theme's project cards. Stored as JSON text in Post.fields.

export const POST_FIELD_KEYS = ["type", "area", "schedule", "price"] as const;
export type PostFieldKey = (typeof POST_FIELD_KEYS)[number];
export type PostFields = Partial<Record<PostFieldKey, string>>;

export const POST_FIELD_MAX = 120;

/** Reads stored fields. Unknown keys, non-text values and empty values are dropped. */
export function parseFields(json: string | null | undefined): PostFields {
  if (!json) return {};
  try {
    return pickFields(JSON.parse(json));
  } catch {
    return {};
  }
}

export function pickFields(raw: unknown): PostFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: PostFields = {};
  for (const key of POST_FIELD_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, POST_FIELD_MAX);
  }
  return out;
}

/** Text to store: "" when there are no facts. */
export function serializeFields(fields: unknown): string {
  const picked = pickFields(fields);
  return Object.keys(picked).length > 0 ? JSON.stringify(picked) : "";
}
