import type { EditorLabels } from "@/components/admin/editor/rich-text-editor";
import type { MessageKey } from "@/lib/i18n/messages";

/** Toolbar labels for the editor, translated on the server and passed to the client component. */
export function editorLabels(T: (key: MessageKey) => string): EditorLabels {
  return {
    bold: T("editor.bold"),
    italic: T("editor.italic"),
    underline: T("editor.underline"),
    strike: T("editor.strike"),
    h2: T("editor.h2"),
    h3: T("editor.h3"),
    bulletList: T("editor.bulletList"),
    orderedList: T("editor.orderedList"),
    quote: T("editor.quote"),
    code: T("editor.code"),
    codeBlock: T("editor.codeBlock"),
    link: T("editor.link"),
    unlink: T("editor.unlink"),
    image: T("editor.image"),
    undo: T("editor.undo"),
    redo: T("editor.redo"),
    linkTitle: T("editor.linkTitle"),
    linkAddress: T("editor.linkAddress"),
    linkAddressHint: T("editor.linkAddressHint"),
    linkNewTab: T("editor.linkNewTab"),
    linkSave: T("editor.linkSave"),
    linkRemove: T("editor.unlink"),
    linkCancel: T("editor.linkCancel"),
    linkSelectText: T("editor.linkSelectText"),
    invalidUrl: T("editor.invalidUrl"),
    uploading: T("editor.uploading"),
    uploadFailed: T("editor.uploadFailed"),
    toolbar: T("editor.toolbar"),
    body: T("posts.form.body"),
  };
}
