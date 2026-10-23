// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RichTextEditor, type EditorLabels } from "@/components/admin/editor/rich-text-editor";

afterEach(cleanup);

const labels = Object.fromEntries(
  [
    "bold",
    "italic",
    "underline",
    "strike",
    "h2",
    "h3",
    "bulletList",
    "orderedList",
    "quote",
    "code",
    "codeBlock",
    "link",
    "unlink",
    "image",
    "undo",
    "redo",
    "linkTitle",
    "linkAddress",
    "linkAddressHint",
    "linkNewTab",
    "linkSave",
    "linkRemove",
    "linkCancel",
    "linkSelectText",
    "uploading",
    "uploadFailed",

    "invalidUrl",
    "toolbar",
    "body",
  ].map((k) => [k, k])
) as EditorLabels;

describe("RichTextEditor", () => {
  it("renders a labelled toolbar and submits the initial HTML as a hidden field", async () => {
    const { container } = render(
      <RichTextEditor name="body" initialHtml="<h2>Xin chào</h2><p>Nội dung</p>" labels={labels} />
    );
    expect(screen.getByRole("toolbar", { name: "toolbar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "bold" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "h2" })).toBeTruthy();
    const hidden = container.querySelector('input[type="hidden"][name="body"]') as HTMLInputElement;
    expect(hidden.value).toBe("<h2>Xin chào</h2><p>Nội dung</p>");
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());
    expect(container.querySelector(".ProseMirror h2")?.textContent).toBe("Xin chào");
  });
});
