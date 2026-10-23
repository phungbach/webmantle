"use client";

import { createContext, useContext } from "react";
import type { EditorLabels } from "@/components/admin/editor/rich-text-editor";
import type { MediaItem, Translate } from "./types";

type DesignerContext = { T: Translate; editorLabels: EditorLabels; media: MediaItem[] };

const Ctx = createContext<DesignerContext | null>(null);

export const DesignerProvider = Ctx.Provider;

export function useDesigner(): DesignerContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("DesignerProvider is missing");
  return value;
}

/** Builds a translator from the builder.* messages the server passed down. */
export function makeTranslate(messages: Record<string, string>): Translate {
  return (key, vars) => {
    let text = messages[key] ?? key;
    if (vars)
      for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
}
