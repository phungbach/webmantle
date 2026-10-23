"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { BLOCK_DEFS, BUILDER_TYPES, type BuilderBlockType } from "@/lib/builder/blocks";
import {
  discardDraftAction,
  publishAction,
  resetAction,
  saveDraftAction,
} from "@/app/admin/actions/builder";
import type { EditorLabels } from "@/components/admin/editor/rich-text-editor";
import { DesignerProvider, makeTranslate } from "./context";
import { callAction } from "./call-action";
import { Inspector } from "./inspector";
import { ThemeInspector } from "./theme-inspector";
import { useThemeContent, type ThemeContentInit } from "./use-theme-content";
import { removeAt, splitPath, type Json } from "./content-path";
import { Palette } from "./palette";
import { PreviewFrame, type Device } from "./preview-frame";
import { StructureTree, type DropHint } from "./structure-tree";
import { Topbar, type SaveStatus } from "./topbar";
import { initState, makeBlock, reducer } from "./state";
import { canPlace, countNodes, find, flatten, topLevel } from "./tree";
import { validateDoc } from "./validate";
import { LIMITS, type BlockNode, type LayoutDoc, type MediaItem, type Target } from "./types";

type Props = {
  target: Target;
  title: string;
  backHref: string;
  liveHref: string;
  previewSrc: string;
  initialDoc: LayoutDoc | null;
  hasDraft: boolean;
  hasPublished: boolean;
  messages: Record<string, string>;
  editorLabels: EditorLabels;
  media: MediaItem[];
  themeContent: ThemeContentInit;
};

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

type Drag = { source: "new" | "row"; block: BlockNode };
type Drop = {
  parentId: string | null;
  index: number;
  placement: "before" | "after" | "into" | "end";
  valid: boolean;
  reason?: string;
};

/** Where a dragged block would land, from the row under it and the vertical position inside that row. */
function computeDrop(
  doc: LayoutDoc,
  drag: Drag,
  overId: string,
  centerY: number,
  overTop: number,
  overHeight: number
): Drop {
  const place = (parentId: string | null, index: number, placement: Drop["placement"]): Drop => {
    const check = canPlace(doc, drag.block, parentId);
    return { parentId, index, placement, valid: check.valid, reason: check.reason };
  };
  if (overId === "end") return place(null, doc.blocks.length, "end");
  const over = find(doc, overId.replace(/^row:/, ""));
  if (!over) return { parentId: null, index: 0, placement: "end", valid: false };
  const ratio = overHeight > 0 ? (centerY - overTop) / overHeight : 0.5;
  const container = BLOCK_DEFS[over.node.type].container;
  if (container && ratio > 0.3 && ratio < 0.7 && over.node.id !== drag.block.id)
    return place(over.node.id, over.node.children?.length ?? 0, "into");
  const placement = ratio < 0.5 ? "before" : "after";
  let { parentId, index } = over.loc;
  // A section can only live at the top level: land next to the section that holds the row.
  if (drag.block.type === "Section" && parentId) {
    parentId = null;
    index = topLevel(doc, over.node.id).index;
  }
  return place(parentId, placement === "before" ? index : index + 1, placement);
}

/** Below this window width (Tailwind lg) the side panels become bottom sheets over the preview. */
const PHONE_MAX = 1024;
const isPhone = () => typeof window !== "undefined" && window.innerWidth < PHONE_MAX;
/** A side panel: a bottom sheet on small screens, a docked column from lg up. */
const SHEET =
  "fixed inset-x-0 bottom-0 z-30 h-[70vh] min-h-0 flex-col rounded-t-2xl border-t border-line bg-white shadow-2xl lg:static lg:z-auto lg:h-auto lg:rounded-none lg:border-t-0 lg:shadow-none";

export function Designer(props: Props) {
  const router = useRouter();
  const T = useMemo(() => makeTranslate(props.messages), [props.messages]);
  const [state, dispatch] = useReducer(reducer, props.initialDoc, initState);
  const [savedRev, setSavedRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [scrollRequest, setScrollRequest] = useState<{ id: string; n: number } | null>(null);
  const [tab, setTab] = useState<"blocks" | "structure">("blocks");
  const [hasDraft, setHasDraft] = useState(props.hasDraft);
  const [hasPublished, setHasPublished] = useState(props.hasPublished);
  const [announce, setAnnounce] = useState("");
  const [themeSel, setThemeSel] = useState<{
    path: string;
    kind: string;
    hrefPath?: string;
  } | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ path: string; value: string; n: number } | null>(null);
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Side panels: collapsible, remembered per browser. Default open, narrow.
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  useEffect(() => {
    // On a phone the panels are bottom sheets over the preview, so start with the preview alone.
    if (window.innerWidth < PHONE_MAX) {
      setLeftOpen(false);
      setRightOpen(false);
      return;
    }
    try {
      const saved = JSON.parse(window.localStorage.getItem("designer.panels") ?? "null") as {
        left?: boolean;
        right?: boolean;
      } | null;
      if (saved) {
        if (typeof saved.left === "boolean") setLeftOpen(saved.left);
        if (typeof saved.right === "boolean") setRightOpen(saved.right);
      }
    } catch {
      // Storage can be blocked; the panels simply start open.
    }
  }, []);
  // Selecting something opens the inspector if it was collapsed.
  const hasSelection = Boolean(state.selectedId || themeSel);
  useEffect(() => {
    if (!hasSelection) return;
    setRightOpen(true);
    // Only one sheet at a time on a phone.
    if (window.innerWidth < PHONE_MAX) setLeftOpen(false);
  }, [hasSelection, state.selectedId, themeSel?.path]);
  const setPanels = (left: boolean, right: boolean) => {
    setLeftOpen(left);
    setRightOpen(right);
    // Phone layouts are not remembered: the next visit starts with the preview alone.
    if (window.innerWidth < PHONE_MAX) return;
    try {
      window.localStorage.setItem("designer.panels", JSON.stringify({ left, right }));
    } catch {
      // Not remembered, still works.
    }
  };
  // On a phone-sized window a 1280px page would be tiny, so start in the mobile preview.
  useEffect(() => {
    if (window.innerWidth < 768) setDevice("mobile");
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const dropRef = useRef<Drop | null>(null);

  // ---- The theme's own texts and pictures (site-wide, saved per block to a draft layer) ----
  const theme = useThemeContent(props.themeContent, {
    onSaved: () => setReloadKey((k) => k + 1),
    onError: (message) => setContentError(message),
    fallbackMessage: props.messages["builder.status.error"] ?? "",
  });
  const contentDirty = theme.draftKeys.length > 0;

  const docRef = useRef(state.doc);
  const revRef = useRef(state.revision);
  const savedRevRef = useRef(0);
  docRef.current = state.doc;
  revRef.current = state.revision;

  const validation = useMemo(() => validateDoc(state.doc), [state.doc]);
  const validRef = useRef(validation.ok);
  validRef.current = validation.ok;
  const dirty = state.revision > savedRev;
  // Derived, never stored: it can only be wrong if its inputs are.
  const live: "published" | "differs" | "none" =
    hasDraft || dirty || contentDirty
      ? "differs"
      : // Without a layout the theme's own template is what visitors see, so nothing is unpublished.
        hasPublished || state.doc.blocks.length === 0
        ? "published"
        : "none";
  const empty = state.doc.blocks.length === 0;
  const rows = useMemo(() => flatten(state.doc), [state.doc]);
  const selected = state.selectedId ? find(state.doc, state.selectedId) : null;

  // ---- Re-sync from the server after Discard or Reset ----
  // Those actions are followed by router.refresh(); the new props are then adopted exactly once.
  // (Comparing the old and new documents is not enough: a discard can leave the server document
  // equal to what the page loaded with while the editor holds newer drafts.)
  const awaitingSync = useRef(false);
  const blockSave = useRef(false);
  useEffect(() => {
    if (!awaitingSync.current) return;
    awaitingSync.current = false;
    blockSave.current = false;
    dispatch({ type: "replace", doc: props.initialDoc ?? { version: 1, blocks: [] } });
    // The reducer bumps the revision on replace; the server state is by definition saved.
    savedRevRef.current = revRef.current + 1;
    setSavedRev(revRef.current + 1);
    setHasDraft(props.hasDraft);
    setHasPublished(props.hasPublished);
    setSaveError(null);
    setContentError(null);
    theme.resync(props.themeContent);
    setThemeSel(null);
    setReloadKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialDoc, props.hasDraft, props.hasPublished, props.themeContent]);

  // ---- Saving ----
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveNow = useCallback(
    (force = false): Promise<boolean> => {
      chain.current = chain.current.then(async () => {
        if (blockSave.current) return false;
        const rev = revRef.current;
        if (!force && rev <= savedRevRef.current) return true;
        if (!validRef.current) return false;
        setSaving(true);
        const result = await callAction(
          () => saveDraftAction(props.target, JSON.stringify(docRef.current)),
          T("builder.status.error")
        );
        setSaving(false);
        if (!result.ok) {
          setSaveError(result.message);
          return false;
        }
        setSaveError(null);
        savedRevRef.current = Math.max(savedRevRef.current, rev);
        setSavedRev(savedRevRef.current);
        setHasDraft(true);
        setReloadKey((k) => k + 1);
        return true;
      });
      return chain.current;
    },
    [props.target, T]
  );

  useEffect(() => {
    if (state.revision <= savedRevRef.current || !validation.ok) return;
    const timer = setTimeout(() => void saveNow(), 1500);
    return () => clearTimeout(timer);
  }, [state.revision, validation.ok, saveNow]);

  useEffect(() => {
    const flush = () => {
      if (revRef.current > savedRevRef.current) void saveNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (revRef.current > savedRevRef.current || themePendingRef.current()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [saveNow]);

  const themePendingRef = useRef(theme.hasPending);
  themePendingRef.current = theme.hasPending;

  const status: SaveStatus = saving
    ? "saving"
    : saveError
      ? "error"
      : !validation.ok
        ? "invalid"
        : dirty
          ? "unsaved"
          : "saved";

  // ---- Actions ----
  const flash = useCallback((text: string) => {
    setAnnounce(text);
    setNotice(text);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const reasonText = useCallback(
    (reason?: string) => T(`builder.invalid.${reason ?? "container"}`),
    [T]
  );

  const select = useCallback((id: string | null, scroll = true) => {
    dispatch({ type: "select", id });
    if (id) setThemeSel(null);
    if (id && scroll) setScrollRequest((r) => ({ id, n: (r?.n ?? 0) + 1 }));
  }, []);

  // ---- Theme content handlers ----
  const onThemeSelect = useCallback((sel: { path: string; kind: string; hrefPath?: string }) => {
    dispatch({ type: "select", id: null });
    setThemeSel(sel);
  }, []);
  const setThemeValue = useCallback(
    (path: string, value: Json) => {
      theme.setPath(path, value);
      // Show a changed text in the frame at once; the reload after the save settles everything else.
      if (typeof value === "string") setApplied((a) => ({ path, value, n: (a?.n ?? 0) + 1 }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.setPath]
  );
  const removeThemeValue = useCallback(
    (path: string) => {
      const [key, ...rest] = splitPath(path);
      if (!key) return;
      theme.setKey(key, removeAt(theme.content[key], rest));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.setKey, theme.content]
  );
  const selectThemePath = useCallback(
    (path: string) => setThemeSel((s) => ({ path, kind: "group", hrefPath: s?.hrefPath })),
    []
  );

  const addBlock = useCallback(
    (type: BuilderBlockType) => {
      const doc = docRef.current;
      const block = makeBlock(type);
      const sel = state.selectedId ? find(doc, state.selectedId) : null;
      let parentId: string | null = null;
      let index = doc.blocks.length;
      if (sel) {
        if (BLOCK_DEFS[sel.node.type].container && canPlace(doc, block, sel.node.id).valid) {
          parentId = sel.node.id;
          index = sel.node.children?.length ?? 0;
        } else {
          parentId = sel.loc.parentId;
          index = sel.loc.index + 1;
          if (type === "Section" && parentId) {
            // Sections are top-level only: go after the section that holds the selection.
            parentId = null;
            index = topLevel(doc, sel.node.id).index + 1;
          }
        }
      }
      const check = canPlace(doc, block, parentId);
      if (!check.valid) {
        flash(reasonText(check.reason));
        return;
      }
      dispatch({ type: "add", block, parentId, index });
      setScrollRequest((r) => ({ id: block.id, n: (r?.n ?? 0) + 1 }));
      flash(T("builder.added", { name: T(`builder.block.${type}`) }));
    },
    [state.selectedId, flash, reasonText, T]
  );

  const moveBlock = useCallback(
    (id: string, dir: -1 | 1) => {
      const doc = docRef.current;
      const found = find(doc, id);
      if (!found) return;
      const { parentId, index } = found.loc;
      const siblings = parentId ? (find(doc, parentId)?.node.children ?? []) : doc.blocks;
      const target = index + dir;
      let to: { parentId: string | null; index: number } | null = null;
      if (target >= 0 && target < siblings.length) to = { parentId, index: target };
      else if (parentId) {
        // At the edge of a container: step out of it.
        const parent = find(doc, parentId)!;
        to = { parentId: parent.loc.parentId, index: parent.loc.index + (dir === 1 ? 1 : 0) };
      }
      if (!to || !canPlace(doc, found.node, to.parentId).valid) {
        flash(T("builder.cannotMove"));
        return;
      }
      dispatch({ type: "move", id, parentId: to.parentId, index: to.index });
      flash(T("builder.moved", { name: T(`builder.block.${found.node.type}`), pos: to.index + 1 }));
    },
    [flash, T]
  );

  const removeBlock = useCallback(
    (id: string) => {
      const found = find(docRef.current, id);
      dispatch({ type: "remove", id });
      if (found) flash(T("builder.removed", { name: T(`builder.block.${found.node.type}`) }));
    },
    [flash, T]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const doc = docRef.current;
      const found = find(doc, id);
      if (!found) return;
      if (countNodes(doc.blocks) + countNodes([found.node]) > LIMITS.nodes) {
        flash(reasonText("count"));
        return;
      }
      dispatch({ type: "duplicate", id });
    },
    [flash, reasonText]
  );

  // Undo and redo with the keyboard, unless the user is typing (the field has its own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Drag and drop ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      // Enter activates the focused button (adds a block); only Space starts a keyboard drag.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const dragFor = (id: string): Drag | null => {
    if (id.startsWith("new:")) {
      const type = id.slice(4);
      return (BUILDER_TYPES as readonly string[]).includes(type)
        ? { source: "new", block: makeBlock(type as BuilderBlockType) }
        : null;
    }
    const found = find(docRef.current, id.replace(/^row:/, ""));
    return found ? { source: "row", block: found.node } : null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setDrag(dragFor(String(e.active.id)));
    setTab("structure");
  };
  const onDragMove = (e: DragMoveEvent) => {
    if (!drag || !e.over) {
      dropRef.current = null;
      setHint(null);
      return;
    }
    // With a mouse or touch the pointer decides; with the keyboard the dragged item's centre does.
    const start = e.activatorEvent as MouseEvent | KeyboardEvent;
    const translated = e.active.rect.current.translated;
    const centerY =
      "clientY" in start
        ? start.clientY + e.delta.y
        : translated
          ? translated.top + translated.height / 2
          : e.over.rect.top;
    const result = computeDrop(
      docRef.current,
      drag,
      String(e.over.id),
      centerY,
      e.over.rect.top,
      e.over.rect.height
    );
    dropRef.current = result;
    setHint({ overId: String(e.over.id), placement: result.placement, valid: result.valid });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const result = dropRef.current;
    const current = drag;
    setDrag(null);
    setHint(null);
    dropRef.current = null;
    if (!current || !e.over || !result) return;
    if (!result.valid) {
      flash(reasonText(result.reason));
      return;
    }
    if (current.source === "new") {
      dispatch({
        type: "add",
        block: current.block,
        parentId: result.parentId,
        index: result.index,
      });
      setScrollRequest((r) => ({ id: current.block.id, n: (r?.n ?? 0) + 1 }));
      flash(T("builder.added", { name: T(`builder.block.${current.block.type}`) }));
      return;
    }
    const from = find(docRef.current, current.block.id);
    if (!from) return;
    let index = result.index;
    if (from.loc.parentId === result.parentId && from.loc.index < index) index -= 1;
    if (from.loc.parentId === result.parentId && from.loc.index === index) return;
    dispatch({ type: "move", id: current.block.id, parentId: result.parentId, index });
    flash(T("builder.moved", { name: T(`builder.block.${current.block.type}`), pos: index + 1 }));
  };
  const onDragCancel = () => {
    setDrag(null);
    setHint(null);
    dropRef.current = null;
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => T("builder.dragStart", { name: label(String(active.id)) }),
    onDragOver: ({ active }) =>
      dropRef.current && !dropRef.current.valid
        ? reasonText(dropRef.current.reason)
        : T("builder.dragOver", { name: label(String(active.id)) }),
    onDragEnd: ({ active }) => T("builder.dragEnd", { name: label(String(active.id)) }),
    onDragCancel: () => T("builder.dragCancel"),
  };
  function label(id: string): string {
    if (id.startsWith("new:")) return T(`builder.block.${id.slice(4)}`);
    const found = find(state.doc, id.replace(/^row:/, ""));
    return found ? T(`builder.block.${found.node.type}`) : "";
  }

  // ---- Server actions ----
  const run = async (work: () => Promise<{ ok: boolean; message: string }>, refresh = false) => {
    setBusy(true);
    const result = await work();
    setBusy(false);
    flash(result.message);
    if (!result.ok) setSaveError(result.message);
    else if (refresh) router.refresh();
    return result.ok;
  };

  const onPublish = async () => {
    setBusy(true);
    // Order: save what is pending, publish the theme's text edits, then the page layout.
    const contentSaved = await theme.flush();
    if (!contentSaved) {
      setBusy(false);
      flash(T("builder.cannotPublish"));
      return;
    }
    if (theme.draftKeys.length > 0) {
      const ok = await theme.publish();
      if (!ok) {
        setBusy(false);
        return;
      }
    }
    if (docRef.current.blocks.length > 0) {
      const saved = await saveNow(true);
      if (!saved) {
        setBusy(false);
        flash(T("builder.cannotPublish"));
        return;
      }
      setBusy(false);
      const ok = await run(() =>
        callAction(() => publishAction(props.target), T("builder.status.error"))
      );
      if (ok) {
        setHasDraft(false);
        setHasPublished(true);
      }
    } else {
      setBusy(false);
      flash(T("builder.published"));
    }
    setReloadKey((k) => k + 1);
  };
  const onSave = async () => {
    setBusy(true);
    const ok = await saveNow(true);
    setBusy(false);
    if (ok) flash(T("builder.saved"));
    else if (!validRef.current) flash(T("builder.status.invalid"));
  };
  // Discard and Reset: stop autosave, let a save in flight finish first (so it cannot land after the
  // discard), run the action, then adopt the server's state from the refreshed props.
  const discardOrReset = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    blockSave.current = true;
    awaitingSync.current = true;
    await chain.current;
    const ok = await run(action, true);
    if (!ok) {
      blockSave.current = false;
      awaitingSync.current = false;
      return;
    }
    // Safety net: if the refreshed props never arrive, reload the page rather than show old content.
    setTimeout(() => {
      if (awaitingSync.current) window.location.reload();
    }, 5000);
  };
  const onDiscard = async () => {
    const hasContent = theme.draftKeys.length > 0;
    if (!window.confirm(T(hasContent ? "builder.discardContentConfirm" : "builder.discardConfirm")))
      return;
    if (hasContent) {
      // Theme text drafts are separate from the layout draft; stop their saves and drop them first.
      await theme.stop();
      const ok = await theme.discard();
      if (!ok) return;
    }
    if (hasDraft)
      await discardOrReset(() =>
        callAction(() => discardDraftAction(props.target), T("builder.status.error"))
      );
    else {
      // Only theme text edits existed: refresh to adopt the server state.
      awaitingSync.current = true;
      blockSave.current = true;
      router.refresh();
      setTimeout(() => {
        if (awaitingSync.current) window.location.reload();
      }, 5000);
    }
  };
  const onReset = async () => {
    if (!window.confirm(T("builder.resetConfirm"))) return;
    await discardOrReset(() =>
      callAction(() => resetAction(props.target), T("builder.status.error"))
    );
  };

  const ctx = useMemo(
    () => ({ T, editorLabels: props.editorLabels, media: props.media }),
    [T, props.editorLabels, props.media]
  );

  const selectedIssues = state.selectedId ? (validation.issues.get(state.selectedId) ?? []) : [];

  return (
    <DesignerProvider value={ctx}>
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas">
        <Topbar
          backHref={props.backHref}
          title={props.title}
          status={status}
          liveState={live}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          onToggleLeft={() => setPanels(!leftOpen, isPhone() ? false : rightOpen)}
          onToggleRight={() => setPanels(isPhone() ? false : leftOpen, !rightOpen)}
          onFocusMode={() =>
            leftOpen || rightOpen ? setPanels(false, false) : setPanels(true, !isPhone())
          }
          device={device}
          zoom={zoom}
          onDevice={setDevice}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          onUndo={() => dispatch({ type: "undo" })}
          onRedo={() => dispatch({ type: "redo" })}
          onSave={onSave}
          onPublish={onPublish}
          canPublish={(!empty || contentDirty) && validation.ok}
          contentNote={
            contentDirty || props.themeContent.canEdit ? T("builder.themeSiteWide") : undefined
          }
          busy={busy || saving}
          liveHref={props.liveHref}
          onDiscard={onDiscard}
          onReset={onReset}
          canDiscard={hasDraft || contentDirty}
          canReset={hasDraft || hasPublished}
        />
        {contentError ? (
          <p
            role="alert"
            className="flex items-start justify-between gap-3 border-b border-danger-600/30 bg-danger-50 px-4 py-2 text-sm text-danger-600"
          >
            <span>{contentError}</span>
            <button
              type="button"
              onClick={() => setContentError(null)}
              className="shrink-0 font-medium underline"
            >
              {T("builder.dismiss")}
            </button>
          </p>
        ) : null}
        {saveError ? (
          <p
            role="alert"
            className="border-b border-danger-600/30 bg-danger-50 px-4 py-2 text-sm text-danger-600"
          >
            {saveError}
          </p>
        ) : null}
        <div
          className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[var(--designer-cols)]"
          style={
            {
              "--designer-cols": `${leftOpen ? "16.25rem" : "0px"} minmax(0,1fr) ${rightOpen ? "18.75rem" : "0px"}`,
            } as React.CSSProperties
          }
        >
          <DndContext
            // dnd-kit numbers its ids with a module counter, which differs between the server (many
            // requests) and the browser (fresh) and breaks hydration. A fixed id makes them match.
            id="designer-dnd"
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
            accessibility={{
              announcements,
              screenReaderInstructions: { draggable: T("builder.dragInstructions") },
            }}
          >
            <aside
              id="designer-left-panel"
              className={`${leftOpen ? "flex" : "hidden"} ${SHEET} lg:col-start-1 lg:row-start-1 lg:border-r`}
            >
              <div
                role="tablist"
                aria-label={T("builder.addBlock")}
                className="flex border-b border-line"
              >
                {(["blocks", "structure"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`designer-tab-${id}`}
                    aria-selected={tab === id}
                    aria-controls="designer-left"
                    onClick={() => setTab(id)}
                    className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-ink-2 hover:text-ink"}`}
                  >
                    {id === "blocks" ? T("builder.palette") : T("builder.structure")}
                  </button>
                ))}
              </div>
              <div
                id="designer-left"
                role="tabpanel"
                aria-labelledby={`designer-tab-${tab}`}
                className="flex min-h-0 flex-1 flex-col"
              >
                {tab === "blocks" ? (
                  <Palette onAdd={addBlock} />
                ) : (
                  <StructureTree
                    rows={rows}
                    selectedId={state.selectedId}
                    hint={hint}
                    actions={{
                      select: (id) => select(id),
                      duplicate: duplicateBlock,
                      remove: removeBlock,
                      move: moveBlock,
                    }}
                  />
                )}
              </div>
            </aside>
            <DragOverlay dropAnimation={null}>
              {drag ? (
                <div
                  className={`whitespace-nowrap rounded-control border px-3 py-2 text-sm font-medium shadow-lg ${hint && !hint.valid ? "border-danger-600 bg-danger-50 text-danger-600" : "border-brand-600 bg-white text-brand-700"}`}
                >
                  {T(`builder.block.${drag.block.type}`)}
                  {hint && !hint.valid && dropRef.current ? (
                    <span className="block text-xs font-normal">
                      {reasonText(dropRef.current.reason)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <section
            className="relative flex h-full min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-1"
            aria-label={T("builder.canvas")}
          >
            {empty && !emptyDismissed ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-white px-3 py-1.5 text-xs">
                <p className="min-w-0 flex-1 text-ink-2">
                  <strong className="font-semibold text-ink">{T("builder.empty")}</strong>{" "}
                  {T("builder.emptyHintTheme")}
                </p>
                <button
                  type="button"
                  onClick={() => addBlock("Section")}
                  className="rounded-control bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {T("builder.startFromBlocks")}
                </button>
                <button
                  type="button"
                  onClick={() => setEmptyDismissed(true)}
                  className="font-medium text-ink-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {T("builder.dismiss")}
                </button>
              </div>
            ) : null}
            <PreviewFrame
              src={props.previewSrc}
              device={device}
              reloadKey={reloadKey}
              selectedId={state.selectedId}
              scrollRequest={scrollRequest}
              onSelect={(id) => {
                if (find(docRef.current, id)) select(id, false);
              }}
              themeSelected={themeSel?.path ?? null}
              onThemeSelect={onThemeSelect}
              onThemeEdit={setThemeValue}
              applied={applied}
              onZoom={setZoom}
            />
            {notice ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                <p className="rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
                  {notice}
                </p>
              </div>
            ) : null}
          </section>

          <aside
            id="designer-inspector-panel"
            className={`${rightOpen ? "flex" : "hidden"} ${SHEET} lg:col-start-3 lg:row-start-1 lg:border-l`}
            aria-label={T("builder.inspector")}
          >
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink-2">
              {T("builder.inspector")}
            </h2>
            {themeSel ? (
              <ThemeInspector
                path={themeSel.path}
                content={theme.content}
                base={props.themeContent.base}
                draftKeys={theme.draftKeys}
                edited={theme.isEdited}
                set={setThemeValue}
                remove={removeThemeValue}
                select={selectThemePath}
                reset={(key) => void theme.resetKey(key)}
              />
            ) : (
              <>
                {!props.themeContent.canEdit && !selected ? (
                  <p className="px-4 pt-4 text-xs text-ink-3">{T("builder.themeReadOnly")}</p>
                ) : null}
                <Inspector
                  node={selected?.node ?? null}
                  issues={selectedIssues}
                  onChange={(props2) =>
                    state.selectedId &&
                    dispatch({
                      type: "props",
                      id: state.selectedId,
                      props: props2,
                      now: Date.now(),
                    })
                  }
                />
              </>
            )}
          </aside>
        </div>
        <div className="sr-only" aria-live="polite" role="status">
          {announce}
        </div>
      </div>
    </DesignerProvider>
  );
}
