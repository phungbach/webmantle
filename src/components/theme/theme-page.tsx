import type { ComponentProps } from "react";
import { ThemeFrame } from "@/components/theme/theme-frame";
import { templateFor } from "@/lib/themes/registry";
import { loadContentOverrides } from "@/lib/themes/content-overrides";
import { collectTagRequests, loadTagPosts } from "@/lib/themes/tag-posts";

/**
 * What the public routes render. It loads the posts that blocks ask for by tag (see CourseList `tag`)
 * and then draws the page with ThemeFrame, which stays free of data loading.
 */
export async function ThemePage({ bundle, values, ctx }: ComponentProps<typeof ThemeFrame>) {
  const requests = collectTagRequests(
    ctx.view.layoutOverride ?? templateFor(bundle, ctx.view.kind, ctx.view.templateId)
  );
  const loaded = requests.length > 0 ? await loadTagPosts(requests, ctx.site.locale) : undefined;
  const view = loaded ? { ...ctx.view, tagPosts: { ...loaded, ...ctx.view.tagPosts } } : ctx.view;
  // The public site shows published edits; the designer preview adds the draft layer.
  const contentOverrides = await loadContentOverrides(bundle.id, ctx.site.locale, {
    draft: ctx.edit === true,
  });
  return (
    <ThemeFrame
      bundle={bundle}
      values={values}
      ctx={{ ...ctx, view }}
      contentOverrides={contentOverrides}
    />
  );
}
