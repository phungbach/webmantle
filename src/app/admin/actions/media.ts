"use server";

import { requirePermission } from "@/lib/auth/session";
import { saveMedia, MEDIA_MAX_BYTES } from "@/lib/media";
import { ValidationError, userMessage } from "@/lib/errors";

export type EditorUploadResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Uploads an image chosen in the rich text editor. It goes through the same checks as the media
 * library (file signature, size, dimensions) and returns the address to insert into the content.
 */
export async function uploadEditorImage(formData: FormData): Promise<EditorUploadResult> {
  try {
    const user = await requirePermission("media:upload");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Choose an image to upload.");
    }
    if (file.size > MEDIA_MAX_BYTES) {
      throw new ValidationError("Images must be 5 MB or smaller.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const id = await saveMedia(user, buffer, "");
    return { ok: true, url: `/media/${id}` };
  } catch (error) {
    console.error("[admin:editor-upload]", error instanceof Error ? error.message : error);
    return { ok: false, message: userMessage(error) };
  }
}
