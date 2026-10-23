import { savePageAction } from "@/app/admin/actions/content";
import { Save } from "lucide-react";
import { Button, Card, Field, TextArea } from "@/components/admin/ui";
import { TemplatePicker } from "@/components/admin/template-picker";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { editorLabels } from "@/components/admin/editor/labels";
import type { TemplateOption } from "@/lib/themes/templates";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export async function PageForm({
  page,
  templates,
}: {
  templates: TemplateOption[];
  page?: {
    id: string;
    title: string;
    slug: string;
    body: string;
    status: string;
    template: string;
    seoTitle: string;
    seoDescription: string;
  };
}) {
  const T = tr(await getLocale());
  return (
    <form action={savePageAction} className="grid gap-6 lg:grid-cols-3">
      {page ? <input type="hidden" name="id" value={page.id} /> : null}
      <div className="space-y-6 lg:col-span-2">
        <Card className="space-y-4">
          <Field
            label={T("common.title")}
            name="title"
            defaultValue={page?.title}
            required
            maxLength={200}
          />
          <Field
            label={T("common.slug")}
            name="slug"
            defaultValue={page?.slug}
            hint={T("posts.form.slugHint")}
            maxLength={80}
          />
          <div>
            <span className="mb-1 block text-sm font-medium text-ink-2">
              {T("posts.form.body")}
            </span>
            <RichTextEditor name="body" initialHtml={page?.body ?? ""} labels={editorLabels(T)} />
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-base font-semibold text-ink">{T("posts.form.searchSocial")}</h2>
          <Field
            label={T("posts.form.seoTitle")}
            name="seoTitle"
            defaultValue={page?.seoTitle}
            maxLength={70}
          />
          <TextArea
            label={T("common.metaDescription")}
            name="seoDescription"
            defaultValue={page?.seoDescription}
            rows={2}
          />
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">{T("common.status")}</span>
            <select
              name="status"
              defaultValue={page?.status ?? "draft"}
              className="w-full rounded-control border border-line-strong px-3 py-2 text-sm"
            >
              <option value="draft">{T("ui.statusDraft")}</option>
              <option value="published">{T("ui.statusPublished")}</option>
              <option value="archived">{T("ui.statusArchived")}</option>
            </select>
          </label>
          <div className="mt-4">
            <TemplatePicker templates={templates} current={page?.template} />
          </div>
        </Card>
        <Button icon={Save}>{page ? T("common.saveChanges") : T("pages.createPage")}</Button>
      </div>
    </form>
  );
}
