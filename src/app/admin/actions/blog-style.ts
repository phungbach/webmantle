"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { saveBlogStyle, BLOG_STYLE_KEY } from "@/lib/blog-style";
import { attempt, backWith, formString, tm } from "@/app/admin/actions/shared";

const PAGE = "/admin/settings?tab=blog-style";

/** Saves the blog look. The form sends fixed option values; saveBlogStyle checks them again. */
export async function saveBlogStyleAction(formData: FormData) {
  const user = await requirePermission("settings:manage");
  const result = await attempt("blog-style-save", async () => {
    await saveBlogStyle({
      listLayout: formString(formData, "listLayout"),
      cardStyle: formString(formData, "cardStyle"),
      cardRadius: Number(formString(formData, "cardRadius")),
      showImages: formData.get("showImages") === "on",
      showExcerpts: formData.get("showExcerpts") === "on",
      titleSize: formString(formData, "titleSize"),
      listWidth: formString(formData, "listWidth"),
      articleWidth: formString(formData, "articleWidth"),
      bodySize: formString(formData, "bodySize"),
    });
    await audit({
      actorId: user.id,
      action: "blog-style.save",
      targetType: "setting",
      targetId: BLOG_STYLE_KEY,
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(PAGE, "error", result.message);
  backWith(PAGE, "ok", await tm("blogStyle.saved"));
}
