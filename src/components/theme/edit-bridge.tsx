"use client";

import { useEffect, useRef } from "react";

const SELECTOR = "[data-ce],[data-bid]";

/**
 * Runs inside the page designer's preview frame (edit mode only). It outlines the hovered and the
 * selected block or theme element, tells the parent window what was clicked, edits theme texts in
 * place, and keeps links and forms inert.
 *
 * Page designer blocks are wrapped in display:contents elements (data-bid), which have no box, so
 * their outline is computed from the union of the wrapper's element children. Theme content
 * elements (data-ce) are ordinary elements and get an orange outline instead of the blue one.
 */
export function EditBridge() {
  const hover = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const origin = window.location.origin;
    // What is selected or hovered: a block id or a theme content path, never both.
    let sel: { kind: "bid" | "ce"; id: string } | null = null;
    let hov: { kind: "bid" | "ce"; id: string } | null = null;
    let editing: { el: HTMLElement; original: string; path: string } | null = null;
    let frame = 0;

    const find = (t: { kind: "bid" | "ce"; id: string } | null): HTMLElement | null => {
      if (!t) return null;
      const attr = t.kind === "bid" ? "data-bid" : "data-ce";
      return document.querySelector<HTMLElement>(`[${attr}="${CSS.escape(t.id)}"]`);
    };

    const rectOf = (el: HTMLElement | null, kind: "bid" | "ce") => {
      if (!el) return null;
      if (kind === "ce") {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return {
          left: r.left + window.scrollX,
          top: r.top + window.scrollY,
          width: r.width,
          height: r.height,
        };
      }
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const child of Array.from(el.children)) {
        const r = child.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
      if (left === Infinity) return null;
      return {
        left: left + window.scrollX,
        top: top + window.scrollY,
        width: right - left,
        height: bottom - top,
      };
    };

    const draw = (box: HTMLDivElement | null, t: typeof sel, dashed: boolean) => {
      if (!box) return;
      const r = t ? rectOf(find(t), t.kind) : null;
      if (!r || !t) {
        box.style.display = "none";
        return;
      }
      const color = t.kind === "ce" ? "#d9480f" : "#3b5bdb";
      box.style.display = "block";
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      box.style.outline = `2px ${dashed ? "dashed" : "solid"} ${color}`;
      box.style.background = dashed
        ? t.kind === "ce"
          ? "rgba(217,72,15,.06)"
          : "rgba(59,91,219,.06)"
        : "transparent";
    };

    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const same = hov && sel && hov.kind === sel.kind && hov.id === sel.id;
        draw(hover.current, same ? null : hov, true);
        draw(selected.current, sel, false);
      });
    };

    const announce = (text: string) => {
      if (live.current) live.current.textContent = text;
    };

    /** The innermost theme element or block under the event target. */
    const targetAt = (target: EventTarget | null) => {
      const el = (target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!el) return null;
      const path = el.getAttribute("data-ce");
      if (path)
        return {
          el,
          kind: "ce" as const,
          id: path,
          ceKind: el.getAttribute("data-ce-kind") ?? "text",
        };
      return { el, kind: "bid" as const, id: el.getAttribute("data-bid") ?? "", ceKind: "" };
    };

    // ---- Theme text editing ----
    const endEditing = () => {
      if (!editing) return;
      const { el } = editing;
      el.removeAttribute("contenteditable");
      el.removeAttribute("aria-label");
      el.style.outline = "";
      editing = null;
      redraw();
    };
    const commit = () => {
      if (!editing) return;
      const { el, original, path } = editing;
      const value = (el.innerText ?? el.textContent ?? "").replace(/ /g, " ").trim();
      endEditing();
      if (value === original) return;
      el.textContent = value;
      window.parent.postMessage({ type: "theme:edit", path, value }, origin);
      announce("✓");
    };
    const cancel = () => {
      if (!editing) return;
      const { el, original } = editing;
      el.textContent = original;
      endEditing();
    };
    const startEditing = (el: HTMLElement) => {
      const path = el.getAttribute("data-ce");
      if (!path || el.getAttribute("data-ce-kind") !== "text" || editing) return;
      const original = (el.textContent ?? "").trim();
      editing = { el, original, path };
      el.setAttribute("aria-label", original);
      el.contentEditable = "plaintext-only";
      if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
      el.style.outline = "2px solid #d9480f";
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    // ---- Events ----
    const onMove = (e: MouseEvent) => {
      const t = targetAt(e.target);
      const next = t ? { kind: t.kind, id: t.id } : null;
      if (next?.id !== hov?.id || next?.kind !== hov?.kind) {
        hov = next;
        redraw();
      }
    };
    const onLeave = () => {
      hov = null;
      redraw();
    };
    const onClick = (e: MouseEvent) => {
      // While editing text, clicks inside the field place the caret as usual.
      if (editing && editing.el.contains(e.target as Node)) return;
      // The mobile menu button must still open the menu, so editors can reach the links inside.
      if ((e.target as Element | null)?.closest?.(".cms-mobile-nav__toggle")) return;
      // A summary must still open and close its menu, so editors can reach the items inside.
      if (!(e.target as Element | null)?.closest?.("summary")) e.preventDefault();
      e.stopPropagation();
      const t = targetAt(e.target);
      if (!t) return;
      if (editing) commit();
      sel = { kind: t.kind, id: t.id };
      redraw();
      if (t.kind === "ce") {
        window.parent.postMessage(
          {
            type: "theme:select",
            path: t.id,
            kind: t.ceKind,
            hrefPath: t.el.getAttribute("data-ce-href") ?? undefined,
          },
          origin
        );
      } else {
        window.parent.postMessage({ type: "builder:select", bid: t.id }, origin);
      }
    };
    const onDblClick = (e: MouseEvent) => {
      const t = targetAt(e.target);
      if (t?.kind === "ce" && t.ceKind === "text") {
        e.preventDefault();
        startEditing(t.el);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (editing) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        } else if (e.key === "Enter") {
          const multiline = editing.original.includes("\n");
          if (!(multiline && e.shiftKey)) {
            e.preventDefault();
            commit();
          }
        }
        return;
      }
      // Enter on a focused or selected text starts editing it.
      if (e.key === "Enter") {
        const focused = document.activeElement as HTMLElement | null;
        const el = focused?.matches?.("[data-ce-kind=text]")
          ? focused
          : find(sel?.kind === "ce" ? sel : null);
        if (el?.getAttribute("data-ce-kind") === "text") {
          e.preventDefault();
          startEditing(el);
        }
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (editing && e.target === editing.el) commit();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!editing || !editing.el.contains(e.target as Node)) return;
      e.preventDefault();
      const multiline = editing.original.includes("\n");
      let text = e.clipboardData?.getData("text/plain") ?? "";
      if (!multiline) text = text.replace(/\s*[\r\n]+\s*/g, " ");
      document.execCommand("insertText", false, text);
    };
    const onSubmit = (e: Event) => e.preventDefault();

    const setText = (el: HTMLElement, value: string) => {
      // Keep icons and other child elements; only the text node changes.
      const node = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""
      );
      if (node) node.textContent = value;
      else if (el.children.length === 0) el.textContent = value;
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== window.parent) return;
      const data = e.data as { type?: string; bid?: string; path?: string; value?: unknown } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "builder:hello") {
        window.parent.postMessage({ type: "builder:ready" }, origin);
        reportHeight();
      } else if (data.type === "builder:selected") {
        sel = typeof data.bid === "string" && data.bid ? { kind: "bid", id: data.bid } : null;
        redraw();
      } else if (data.type === "theme:selected") {
        sel = typeof data.path === "string" && data.path ? { kind: "ce", id: data.path } : null;
        redraw();
      } else if (data.type === "theme:applied" && typeof data.path === "string") {
        if (typeof data.value === "string")
          document
            .querySelectorAll<HTMLElement>(`[data-ce="${CSS.escape(data.path)}"]`)
            .forEach((el) => {
              if (!editing || editing.el !== el) setText(el, data.value as string);
            });
        redraw();
      } else if (data.type === "builder:scrollTo" && typeof data.bid === "string") {
        find({ kind: "bid", id: data.bid })?.firstElementChild?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } else if (data.type === "theme:scrollTo" && typeof data.path === "string") {
        find({ kind: "ce", id: data.path })?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    };

    let lastHeight = 0;
    const reportHeight = () => {
      const height = document.documentElement.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "builder:height", height }, origin);
      }
      redraw();
    };
    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.body);

    // Texts can be reached with the keyboard: Tab to one, Enter to edit it.
    document.querySelectorAll<HTMLElement>("[data-ce-kind=text]").forEach((el) => {
      el.tabIndex = 0;
    });

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("resize", redraw);
    window.parent.postMessage({ type: "builder:ready" }, origin);
    reportHeight();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", redraw);
      window.removeEventListener("resize", redraw);
    };
  }, []);

  const box = (): React.CSSProperties => ({
    position: "absolute",
    display: "none",
    zIndex: 2147483000,
    pointerEvents: "none",
    outlineOffset: "-2px",
  });

  return (
    <>
      <div ref={hover} aria-hidden="true" style={box()} />
      <div ref={selected} aria-hidden="true" style={box()} />
      <div
        ref={live}
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      />
    </>
  );
}
