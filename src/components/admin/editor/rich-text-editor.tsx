"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { LinkDialog } from "@/components/admin/editor/link-dialog";
import { uploadEditorImage } from "@/app/admin/actions/media";
import { ImageIcon, Link2, Redo2, Undo2, X } from "lucide-react";
import { Icon } from "@/components/admin/icon";

export type EditorLabels = Record<
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "h2"
  | "h3"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "code"
  | "codeBlock"
  | "link"
  | "unlink"
  | "image"
  | "undo"
  | "redo"
  | "linkTitle"
  | "linkAddress"
  | "linkAddressHint"
  | "linkNewTab"
  | "linkSave"
  | "linkRemove"
  | "linkCancel"
  | "linkSelectText"
  | "invalidUrl"
  | "uploading"
  | "uploadFailed"
  | "toolbar"
  | "body",
  string
>;

type LinkState = { open: boolean; href: string; newTab: boolean; session: number };
type Range = { from: number; to: number };

/**
 * Rich text editor (Tiptap) for page content. The HTML is kept in a hidden input so the page form
 * submits it like any other field. The server sanitizes it again before it is stored.
 */
export function RichTextEditor({
  name,
  initialHtml,
  labels,
  onChange,
}: {
  name: string;
  initialHtml: string;
  labels: EditorLabels;
  /** Called from the editor's own update event with the new HTML (not from an effect). */
  onChange?: (html: string) => void;
}) {
  const [html, setHtml] = useState(initialHtml);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState<LinkState>({ open: false, href: "", newTab: false, session: 0 });
  const savedRange = useRef<Range | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const hiddenInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    // Rendering on the server would mismatch the browser; the editor mounts after hydration.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        },
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: initialHtml,
    onUpdate: ({ editor: e }) => {
      const next = e.getHTML();
      setHtml(next);
      onChange?.(next);
    },
    editorProps: {
      attributes: {
        class: "cms-editor-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": labels.body,
      },
    },
  });

  // The hidden field changes without a browser input event. Announce each change so the form's
  // other panels (the SEO checks, for example) can read the new content.
  useEffect(() => {
    hiddenInput.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [html]);

  // Remember the selection before the dialog takes focus, so the link is applied to the same text.
  const openLinkDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const current = editor.getAttributes("link") as { href?: string; target?: string | null };
    savedRange.current = { from, to };
    const inLink = editor.isActive("link");
    if (!inLink && from === to) {
      setNotice(labels.linkSelectText);
      return;
    }
    setNotice(null);
    setLink((s) => ({
      open: true,
      href: current.href ?? "",
      newTab: current.target === "_blank",
      session: s.session + 1,
    }));
  };

  const closeLinkDialog = () => setLink((s) => ({ ...s, open: false }));

  const applyLink = (href: string, newTab: boolean) => {
    if (!editor || !savedRange.current) return;
    editor
      .chain()
      .focus()
      .setTextSelection(savedRange.current)
      .extendMarkRange("link")
      .setLink({ href, target: newTab ? "_blank" : null })
      .run();
    closeLinkDialog();
  };

  const removeLink = () => {
    if (!editor || !savedRange.current) return;
    editor
      .chain()
      .focus()
      .setTextSelection(savedRange.current)
      .extendMarkRange("link")
      .unsetLink()
      .run();
    closeLinkDialog();
  };

  return (
    <div className="cms-editor">
      <Toolbar
        editor={editor}
        labels={labels}
        uploading={uploading}
        onOpenLink={openLinkDialog}
        onUnlink={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()}
        onPickImage={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !editor) return;
          setNotice(null);
          setUploading(true);
          const data = new FormData();
          data.append("file", file);
          const result = await uploadEditorImage(data);
          setUploading(false);
          if (!result.ok) {
            setNotice(result.message || labels.uploadFailed);
            return;
          }
          editor.chain().focus().setImage({ src: result.url, alt: "" }).run();
        }}
      />
      {notice ? (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {notice}
        </p>
      ) : null}
      <EditorContent
        editor={editor}
        className="mt-2 rounded-control border border-line-strong bg-white"
      />
      <LinkDialog
        key={link.session}
        open={link.open}
        initialHref={link.href}
        initialNewTab={link.newTab}
        labels={{
          title: labels.linkTitle,
          address: labels.linkAddress,
          addressHint: labels.linkAddressHint,
          newTab: labels.linkNewTab,
          save: labels.linkSave,
          remove: labels.linkRemove,
          cancel: labels.linkCancel,
          invalidUrl: labels.invalidUrl,
        }}
        onSave={applyLink}
        onRemove={removeLink}
        onClose={closeLinkDialog}
      />
      <input ref={hiddenInput} type="hidden" name={name} value={html} />
    </div>
  );
}

const INACTIVE = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  h2: false,
  h3: false,
  bulletList: false,
  orderedList: false,
  quote: false,
  code: false,
  codeBlock: false,
  link: false,
};

function Toolbar({
  editor,
  labels,
  uploading,
  onOpenLink,
  onUnlink,
  onPickImage,
}: {
  editor: Editor | null;
  labels: EditorLabels;
  uploading: boolean;
  onOpenLink: () => void;
  onUnlink: () => void;
  onPickImage: () => void;
}) {
  const live = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      strike: e?.isActive("strike") ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      code: e?.isActive("code") ?? false,
      codeBlock: e?.isActive("codeBlock") ?? false,
      link: e?.isActive("link") ?? false,
    }),
  });
  // useEditorState returns null until the editor exists; nothing is active then.
  const state = live ?? INACTIVE;
  if (!editor) return <div className="h-10 rounded-control border border-line bg-canvas" />;

  const button = (
    key: keyof EditorLabels,
    pressed: boolean,
    action: () => void,
    disabled = false,
    text?: React.ReactNode
  ) => (
    <button
      key={key}
      type="button"
      title={labels[key]}
      aria-label={labels[key]}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
      className={`min-w-8 rounded px-2 py-1 text-sm font-medium disabled:opacity-40 ${
        pressed ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-subtle"
      }`}
    >
      {text ?? labels[key]}
    </button>
  );

  return (
    <div
      role="toolbar"
      aria-label={labels.toolbar}
      className="flex flex-wrap gap-1 rounded-control border border-line-strong bg-canvas p-1"
    >
      {button("bold", state.bold, () => editor.chain().focus().toggleBold().run(), false, "B")}
      {button(
        "italic",
        state.italic,
        () => editor.chain().focus().toggleItalic().run(),
        false,
        "I"
      )}
      {button(
        "underline",
        state.underline,
        () => editor.chain().focus().toggleUnderline().run(),
        false,
        "U"
      )}
      {button(
        "strike",
        state.strike,
        () => editor.chain().focus().toggleStrike().run(),
        false,
        "S"
      )}
      <span className="mx-1 w-px bg-line-strong" aria-hidden="true" />
      {button(
        "h2",
        state.h2,
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        false,
        "H2"
      )}
      {button(
        "h3",
        state.h3,
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        false,
        "H3"
      )}
      <span className="mx-1 w-px bg-line-strong" aria-hidden="true" />
      {button(
        "bulletList",
        state.bulletList,
        () => editor.chain().focus().toggleBulletList().run(),
        false,
        "•"
      )}
      {button(
        "orderedList",
        state.orderedList,
        () => editor.chain().focus().toggleOrderedList().run(),
        false,
        "1."
      )}
      {button(
        "quote",
        state.quote,
        () => editor.chain().focus().toggleBlockquote().run(),
        false,
        "❝"
      )}
      {button("code", state.code, () => editor.chain().focus().toggleCode().run(), false, "<>")}
      {button(
        "codeBlock",
        state.codeBlock,
        () => editor.chain().focus().toggleCodeBlock().run(),
        false,
        "{ }"
      )}
      <span className="mx-1 w-px bg-line-strong" aria-hidden="true" />
      {button("link", state.link, onOpenLink, false, <Icon icon={Link2} className="h-4 w-4" />)}
      {state.link
        ? button("unlink", false, onUnlink, false, <Icon icon={X} className="h-4 w-4" />)
        : null}
      {button(
        "image",
        false,
        onPickImage,
        uploading,
        uploading ? labels.uploading : <Icon icon={ImageIcon} className="h-4 w-4" />
      )}
      <span className="mx-1 w-px bg-line-strong" aria-hidden="true" />
      {button(
        "undo",
        false,
        () => editor.chain().focus().undo().run(),
        !editor.can().undo(),
        <Icon icon={Undo2} className="h-4 w-4" />
      )}
      {button(
        "redo",
        false,
        () => editor.chain().focus().redo().run(),
        !editor.can().redo(),
        <Icon icon={Redo2} className="h-4 w-4" />
      )}
    </div>
  );
}
