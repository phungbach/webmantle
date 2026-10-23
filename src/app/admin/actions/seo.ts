"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { saveSeoSettings } from "@/lib/seo/site";
import { attempt, backWith, formString, tm } from "@/app/admin/actions/shared";

const SEO_PAGE = "/admin/settings?tab=seo";

/** Saves the site-wide SEO settings (title separator, home title, share image, noindex...). */
export async function saveSeoSettingsAction(formData: FormData) {
  const result = await attempt("seo-settings", async () => {
    const user = await requirePermission("settings:manage");
    const { changed } = await saveSeoSettings({
      separator: formString(formData, "separator"),
      homeTitle: formString(formData, "homeTitle"),
      homeDescription: formString(formData, "homeDescription"),
      defaultOgImageId: formString(formData, "defaultOgImageId"),
      twitterHandle: formString(formData, "twitterHandle"),
      noindexSite:
        formData.get("noindexSite") === "on" || formString(formData, "noindexSite") === "1",
    });
    await audit({
      actorId: user.id,
      action: "settings.seo",
      targetType: "setting",
      targetId: "seo",
      detail: { changed },
    });
  });
  revalidatePath("/", "layout");
  if (!result.ok) backWith(SEO_PAGE, "error", result.message);
  backWith(SEO_PAGE, "ok", await tm("seo.saved"));
}
