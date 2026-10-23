"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  discardContentAction,
  publishContentAction,
  saveContentKeyAction,
} from "@/app/admin/actions/theme-content";
import { callAction } from "./call-action";
import { getAt, setAt, splitPath, type Json } from "./content-path";

export type ThemeContentInit = {
  /** Theme defaults for the language (content.json + content.<locale>.json). */
  base: Record<string, Json>;
  /** Defaults with the published and draft edits on top. */
  merged: Record<string, Json>;
  draftKeys: string[];
  publishedKeys: string[];
  canEdit: boolean;
};

const DEBOUNCE_MS = 900;
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The theme's editable content in the designer. Edits go to local state at once and are saved to the
 * draft layer per block (one top-level key), debounced, with the saves of one key kept in order. A
 * rejected save is reverted to the last accepted value and reported.
 */
export function useThemeContent(
  init: ThemeContentInit,
  hooks: { onSaved: () => void; onError: (message: string) => void; fallbackMessage: string }
) {
  const [content, setContent] = useState(init.merged);
  const [draftKeys, setDraftKeys] = useState(init.draftKeys);
  const [publishedKeys, setPublishedKeys] = useState(init.publishedKeys);
  const contentRef = useRef(init.merged);
  const accepted = useRef<Record<string, Json>>(init.merged);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = useRef(new Map<string, Promise<boolean>>());
  const pending = useRef(new Set<string>());
  const blocked = useRef(false);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  const put = useCallback((key: string, value: Json) => {
    contentRef.current = { ...contentRef.current, [key]: value };
    setContent(contentRef.current);
  }, []);

  const markDraft = useCallback((key: string) => {
    setDraftKeys((keys) => (keys.includes(key) ? keys : [...keys, key].sort()));
  }, []);

  const saveKey = useCallback(
    (key: string): Promise<boolean> => {
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.delete(key);
      const run = (chains.current.get(key) ?? Promise.resolve(true)).then(async () => {
        if (blocked.current || !pending.current.has(key)) return true;
        pending.current.delete(key);
        const value = contentRef.current[key];
        const result = await callAction(
          () => saveContentKeyAction(key, JSON.stringify(value)),
          hooksRef.current.fallbackMessage
        );
        if (!result.ok) {
          // Go back to what the server accepted last, unless a newer edit already replaced it.
          if (same(contentRef.current[key], value)) put(key, accepted.current[key]);
          hooksRef.current.onError(result.message);
          hooksRef.current.onSaved();
          return false;
        }
        accepted.current = { ...accepted.current, [key]: value };
        hooksRef.current.onSaved();
        return true;
      });
      chains.current.set(key, run);
      return run;
    },
    [put]
  );

  /** Replaces a whole block. */
  const setKey = useCallback(
    (key: string, value: Json) => {
      if (init.canEdit === false) return;
      put(key, value);
      markDraft(key);
      pending.current.add(key);
      const old = timers.current.get(key);
      if (old) clearTimeout(old);
      timers.current.set(
        key,
        setTimeout(() => void saveKey(key), DEBOUNCE_MS)
      );
    },
    [init.canEdit, markDraft, put, saveKey]
  );

  /** Sets one value by its dotted path (text edited in the page or in the inspector). */
  const setPath = useCallback(
    (path: string, value: Json) => {
      const [key, ...rest] = splitPath(path);
      if (!key) return;
      setKey(key, setAt(contentRef.current[key], rest, value));
    },
    [setKey]
  );

  const resetKey = useCallback(
    async (key: string) => {
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.delete(key);
      pending.current.delete(key);
      await (chains.current.get(key) ?? Promise.resolve(true));
      const result = await callAction(
        () => saveContentKeyAction(key, null),
        hooksRef.current.fallbackMessage
      );
      if (!result.ok) {
        hooksRef.current.onError(result.message);
        return false;
      }
      accepted.current = { ...accepted.current, [key]: init.base[key] };
      put(key, init.base[key]);
      markDraft(key);
      hooksRef.current.onSaved();
      return true;
    },
    [init.base, markDraft, put]
  );

  /** Saves everything pending now and waits for all saves in flight. True when all succeeded. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (const key of Array.from(pending.current)) void saveKey(key);
    const results = await Promise.all(Array.from(chains.current.values()));
    return results.every(Boolean) && pending.current.size === 0;
  }, [saveKey]);

  const publish = useCallback(async () => {
    const result = await callAction(() => publishContentAction(), hooksRef.current.fallbackMessage);
    if (!result.ok) {
      hooksRef.current.onError(result.message);
      return false;
    }
    setPublishedKeys((keys) => Array.from(new Set([...keys, ...draftKeys])).sort());
    setDraftKeys([]);
    return true;
  }, [draftKeys]);

  /** Stops saving and forgets unsaved edits (before a discard); returns when saves in flight end. */
  const stop = useCallback(async () => {
    blocked.current = true;
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    pending.current.clear();
    await Promise.all(Array.from(chains.current.values()));
  }, []);

  const discard = useCallback(async () => {
    const result = await callAction(() => discardContentAction(), hooksRef.current.fallbackMessage);
    if (!result.ok) {
      blocked.current = false;
      hooksRef.current.onError(result.message);
    }
    return result.ok;
  }, []);

  const unblock = useCallback(() => {
    blocked.current = false;
  }, []);

  /** Adopts the server's state (after a discard). */
  const resync = useCallback((next: ThemeContentInit) => {
    blocked.current = false;
    contentRef.current = next.merged;
    accepted.current = next.merged;
    setContent(next.merged);
    setDraftKeys(next.draftKeys);
    setPublishedKeys(next.publishedKeys);
  }, []);

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  const hasPending = () => pending.current.size > 0 || timers.current.size > 0;
  const isEdited = (key: string) => !same(content[key], init.base[key]);

  return {
    content,
    draftKeys,
    publishedKeys,
    setPath,
    setKey,
    resetKey,
    flush,
    publish,
    stop,
    discard,
    resync,
    unblock,
    hasPending,
    isEdited,
    getAt: (path: string) => getAt(contentRef.current, splitPath(path)),
  };
}
