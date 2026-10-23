/** Helpers for dotted paths into the theme's content, e.g. "courses.2.title". All immutable. */

export type Json = unknown;
export const isObject = (v: Json): v is Record<string, Json> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const splitPath = (path: string): string[] => path.split(".").filter((s) => s !== "");

export function getAt(root: Json, segs: string[]): Json {
  let cur = root;
  for (const seg of segs) {
    if (Array.isArray(cur)) cur = cur[Number(seg)];
    else if (isObject(cur)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}

export function setAt(root: Json, segs: string[], value: Json): Json {
  if (segs.length === 0) return value;
  const [head, ...rest] = segs as [string, ...string[]];
  if (Array.isArray(root)) {
    const next = [...root];
    next[Number(head)] = setAt(root[Number(head)], rest, value);
    return next;
  }
  const obj = isObject(root) ? root : {};
  return { ...obj, [head]: setAt(obj[head], rest, value) };
}

/** Removes a key from an object, or an index from an array. */
export function removeAt(root: Json, segs: string[]): Json {
  if (segs.length === 0) return root;
  const parent = segs.slice(0, -1);
  const last = segs[segs.length - 1]!;
  const container = getAt(root, parent);
  if (Array.isArray(container)) {
    return setAt(
      root,
      parent,
      container.filter((_, i) => i !== Number(last))
    );
  }
  if (isObject(container)) {
    const next = { ...container };
    delete next[last];
    return setAt(root, parent, next);
  }
  return root;
}

/**
 * The object an element belongs to: the nearest plain object at or above the path. The text
 * "courses.2.title" belongs to "courses.2"; "hero.highlights.1" belongs to "hero".
 */
export function containerPath(content: Record<string, Json>, path: string): string[] {
  const segs = splitPath(path);
  while (segs.length > 0) {
    if (isObject(getAt(content, segs))) return segs;
    segs.pop();
  }
  return [];
}

export const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
