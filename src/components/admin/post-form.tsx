import { savePostAction } from "@/app/admin/actions/content";
import { Button, Card, Field, Note, TextArea } from "@/components/admin/ui";
import { seoChecks, META_MAX, META_MIN } from "@/lib/admin/seo-checks";
import { statusLabel } from "@/lib/admin/labels";
import { parseFields } from "@/lib/content/fields";
import { TemplatePicker } from "@/components/admin/template-picker";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { editorLabels } from "@/components/admin/editor/labels";
import { PostTabs } from "@/components/admin/seo/post-tabs";
import { SeoPanel, type SeoMediaOption } from "@/components/admin/seo/seo-panel";
import type { TemplateOption } from "@/lib/themes/templates";
import { formatDateTimeInput } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { t, tr } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";

type Option = { id: string; name: string };

export async function PostForm({
  post,
  categories,
  tags,
  canPublish,
  canFeature,
  selectedCategoryIds,
  selectedTagIds,
  templates,
}: {
  templates: TemplateOption[];
  post?: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    body: string;
    status: string;
    template: string;
    fields: string;
    publishedAt: Date | null;
    featured: boolean;
    seoTitle: string;
    seoDescription: string;
    canonicalUrl: string;
    focusKeyword: string;
    robotsIndex: boolean;
    robotsFollow: boolean;
    ogTitle: string;
    ogDescription: string;
    twitterCard: string;
    featuredImage: string | null;
    socialImage: string | null;
  };
  categories: Option[];
  tags: Option[];
  canPublish: boolean;
  canFeature: boolean;
  selectedCategoryIds: string[];
  selectedTagIds: string[];
}) {
  const locale = await getLocale();
  const T = tr(locale);
  const media = await prisma.media.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const mediaOptions: SeoMediaOption[] = media.map((m) => ({
    id: m.id,
    url: `/media/${m.id}`,
    alt: m.altText,
    label: m.altText.trim() || m.filename,
  }));
  const featuredAlt = media.find((m) => m.id === post?.featuredImage)?.altText ?? "";

  const contentPanel = (
    <Card className="space-y-4">
      <Field
        label={T("posts.form.title")}
        name="title"
        defaultValue={post?.title}
        required
        maxLength={200}
      />
      <Field
        label={T("common.slug")}
        name="slug"
        defaultValue={post?.slug}
        hint={T("posts.form.slugHint")}
        maxLength={80}
      />
      <TextArea
        label={T("posts.form.excerpt")}
        name="excerpt"
        defaultValue={post?.excerpt}
        rows={3}
        hint={T("posts.form.excerptHint")}
      />
      <div>
        <span className="mb-1 block text-sm font-medium text-ink-2">{T("posts.form.body")}</span>
        <RichTextEditor name="body" initialHtml={post?.body ?? ""} labels={editorLabels(T)} />
        <span className="mt-1 block text-xs text-ink-3">{T("posts.form.bodyHint")}</span>
      </div>
    </Card>
  );

  const seoPanel = (
    <Card>
      <SeoPanel
        locale={locale}
        siteUrl={SITE_URL}
        siteHost={new URL(SITE_URL).host}
        initial={{
          seoTitle: post?.seoTitle ?? "",
          seoDescription: post?.seoDescription ?? "",
          focusKeyword: post?.focusKeyword ?? "",
          canonicalUrl: post?.canonicalUrl ?? "",
          robots: post?.robotsIndex === false ? "noindex" : "index",
          follow: post?.robotsFollow === false ? "nofollow" : "follow",
          ogTitle: post?.ogTitle ?? "",
          ogDescription: post?.ogDescription ?? "",
          twitterCard: post?.twitterCard === "summary" ? "summary" : "summary_large_image",
          featuredImage: post?.featuredImage ?? "",
          socialImage: post?.socialImage ?? "",
          featuredImageAlt: featuredAlt,
        }}
        initialTitle={post?.title ?? ""}
        initialSlug={post?.slug ?? ""}
        media={mediaOptions}
        canAdvanced={canPublish}
        baseTitle={T("meta.siteTitle")}
      />
    </Card>
  );

  const status = post?.status ?? "draft";
  const facts = parseFields(post?.fields);
  const checks = post ? seoChecks(post) : [];
  const metaCheck = checks.find((c) => c.id === "meta");
  const imageCheck = checks.find((c) => c.id === "image");

  return (
    <form id="post-form" action={savePostAction} className="grid gap-5 lg:grid-cols-3">
      {post ? <input type="hidden" name="id" value={post.id} /> : null}
      {/* Enter in a text field submits with this button first, which keeps the current status. */}
      <input type="hidden" name="status" value={status} />
      <button type="submit" tabIndex={-1} aria-hidden="true" className="sr-only">
        {T("common.save")}
      </button>
      <div className="lg:col-span-2">
        <PostTabs
          label={T("seo.tabSeo")}
          tabs={[
            { id: "content", label: T("seo.tabContent") },
            { id: "seo", label: T("seo.tabSeo") },
          ]}
          panels={[contentPanel, seoPanel]}
        />
      </div>
      <div className="space-y-4">
        <Card>
          <h2 className="text-base font-semibold text-ink">
            {T("compose.statusCard", { status: statusLabel(T, status) })}
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            {status === "published"
              ? T("compose.statusPublishedText")
              : status === "archived"
                ? T("compose.statusArchivedText")
                : T("compose.statusDraftText")}
          </p>
          {!canPublish ? (
            <p className="mt-2 text-xs text-ink-3">{T("posts.form.authorsDraftsOnly")}</p>
          ) : null}
          {canPublish && post && status !== "archived" ? (
            <div className="mt-3">
              <Button variant="secondary" form="post-form" name="intent" value="archive">
                {T("compose.archive")}
              </Button>
            </div>
          ) : null}
        </Card>
        <Card className="space-y-4">
          <h2 className="text-base font-semibold text-ink">{T("compose.publishCard")}</h2>
          <Field
            label={T("posts.form.publishDate")}
            name="publishedAt"
            type="datetime-local"
            defaultValue={formatDateTimeInput(post?.publishedAt ?? null)}
            hint={T("posts.form.publishDateHint")}
          />
          {canFeature ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="featured" defaultChecked={post?.featured} />{" "}
              {T("posts.form.feature")}
            </label>
          ) : null}
          <TemplatePicker templates={templates} current={post?.template} />
        </Card>
        <Card className="space-y-3">
          <h2 className="text-base font-semibold text-ink">{T("posts.form.factsTitle")}</h2>
          <p className="text-xs text-ink-3">{T("posts.form.factsHint")}</p>
          <Field
            label={T("posts.form.factType")}
            name="field_type"
            defaultValue={facts.type}
            maxLength={120}
            placeholder={T("posts.form.factTypePlaceholder")}
          />
          <Field
            label={T("posts.form.factArea")}
            name="field_area"
            defaultValue={facts.area}
            maxLength={120}
            placeholder={T("posts.form.factAreaPlaceholder")}
          />
          <Field
            label={T("posts.form.factSchedule")}
            name="field_schedule"
            defaultValue={facts.schedule}
            maxLength={120}
            placeholder={T("posts.form.factSchedulePlaceholder")}
          />
          <Field
            label={T("posts.form.factPrice")}
            name="field_price"
            defaultValue={facts.price}
            maxLength={120}
            placeholder={T("posts.form.factPricePlaceholder")}
          />
        </Card>
        <Card className="space-y-3">
          <h2 className="text-base font-semibold text-ink">{T("posts.form.categories")}</h2>
          {categories.length === 0 ? (
            <p className="text-sm text-ink-3">{T("posts.form.noCategories")}</p>
          ) : null}
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="categoryIds"
                value={c.id}
                defaultChecked={selectedCategoryIds.includes(c.id)}
              />{" "}
              {c.name}
            </label>
          ))}
          <h2 className="pt-2 text-base font-semibold text-ink">{T("posts.form.tags")}</h2>
          {tags.length === 0 ? (
            <p className="text-sm text-ink-3">{T("posts.form.noTags")}</p>
          ) : null}
          {tags.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="tagIds"
                value={x.id}
                defaultChecked={selectedTagIds.includes(x.id)}
              />{" "}
              {t(locale, "tag.prefix", { name: x.name })}
            </label>
          ))}
        </Card>
        {metaCheck ? (
          <Note tone={metaCheck.ok ? "success" : "danger"}>
            {metaCheck.ok
              ? T("compose.seoMetaOk", { n: metaCheck.detail ?? 0 })
              : T("compose.seoMetaBad", { min: META_MIN, max: META_MAX, n: metaCheck.detail ?? 0 })}
          </Note>
        ) : null}
        {imageCheck ? (
          <Note tone={imageCheck.ok ? "success" : "danger"}>
            {imageCheck.ok ? T("compose.seoImageOk") : T("compose.seoImageBad")}
          </Note>
        ) : null}
      </div>
    </form>
  );
}

/** Buttons for the page header. They submit the editor form from outside it. */
export async function PostActions({ status, canPublish }: { status: string; canPublish: boolean }) {
  const T = tr(await getLocale());
  const published = status === "published";
  return (
    <>
      <Button variant="secondary" form="post-form" name="intent" value="draft">
        {published ? T("compose.toDraft") : T("compose.saveDraft")}
      </Button>
      {canPublish ? (
        <Button form="post-form" name="intent" value="publish">
          {published ? T("compose.update") : T("compose.publish")}
        </Button>
      ) : null}
    </>
  );
}
