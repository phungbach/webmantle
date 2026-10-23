import type { BuilderBlockType } from "@/lib/builder/blocks";
import { emptyDoc, type BlockNode, type LayoutDoc } from "./types";
import {
  cloneWithNewIds,
  find,
  insertNode,
  moveNode,
  newBlock,
  removeNode,
  updateProps,
} from "./tree";

export type EditorState = {
  doc: LayoutDoc;
  selectedId: string | null;
  past: LayoutDoc[];
  future: LayoutDoc[];
  /** Bumped by every document change; the autosave watches it. */
  revision: number;
  /** Used to merge rapid edits of one block (typing) into a single undo step. */
  lastEdit: { id: string; at: number } | null;
};

export type Action =
  | { type: "add"; block: BlockNode; parentId: string | null; index: number }
  | { type: "move"; id: string; parentId: string | null; index: number }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "props"; id: string; props: Record<string, unknown>; now: number }
  | { type: "select"; id: string | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; doc: LayoutDoc };

const MAX_HISTORY = 100;
const MERGE_MS = 1000;

export const initState = (doc: LayoutDoc | null): EditorState => ({
  doc: doc ?? emptyDoc(),
  selectedId: null,
  past: [],
  future: [],
  revision: 0,
  lastEdit: null,
});

const commit = (s: EditorState, doc: LayoutDoc, selectedId = s.selectedId): EditorState => ({
  doc,
  selectedId,
  past: [...s.past.slice(-MAX_HISTORY + 1), s.doc],
  future: [],
  revision: s.revision + 1,
  lastEdit: null,
});

export function reducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case "add":
      return commit(s, insertNode(s.doc, a.block, a.parentId, a.index), a.block.id);
    case "move":
      return commit(s, moveNode(s.doc, a.id, a.parentId, a.index));
    case "remove": {
      return commit(s, removeNode(s.doc, a.id), s.selectedId === a.id ? null : s.selectedId);
    }
    case "duplicate": {
      const found = find(s.doc, a.id);
      if (!found) return s;
      const copy = cloneWithNewIds(found.node);
      return commit(s, insertNode(s.doc, copy, found.loc.parentId, found.loc.index + 1), copy.id);
    }
    case "props": {
      // Identical props (an echo, or a field set to the value it already has) change nothing.
      const current = find(s.doc, a.id);
      if (!current || JSON.stringify(current.node.props) === JSON.stringify(a.props)) return s;
      const doc = updateProps(s.doc, a.id, a.props);
      const merge = s.lastEdit && s.lastEdit.id === a.id && a.now - s.lastEdit.at < MERGE_MS;
      return {
        ...s,
        doc,
        past: merge ? s.past : [...s.past.slice(-MAX_HISTORY + 1), s.doc],
        future: [],
        revision: s.revision + 1,
        lastEdit: { id: a.id, at: a.now },
      };
    }
    case "select":
      return s.selectedId === a.id ? s : { ...s, selectedId: a.id };
    case "undo": {
      const previous = s.past[s.past.length - 1];
      if (!previous) return s;
      return {
        ...s,
        doc: previous,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future],
        selectedId: s.selectedId && find(previous, s.selectedId) ? s.selectedId : null,
        revision: s.revision + 1,
        lastEdit: null,
      };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      return {
        ...s,
        doc: next,
        past: [...s.past, s.doc],
        future: s.future.slice(1),
        selectedId: s.selectedId && find(next, s.selectedId) ? s.selectedId : null,
        revision: s.revision + 1,
        lastEdit: null,
      };
    }
    case "replace":
      return { ...initState(a.doc), revision: s.revision + 1 };
  }
}

export const makeBlock = (type: BuilderBlockType) => newBlock(type);
