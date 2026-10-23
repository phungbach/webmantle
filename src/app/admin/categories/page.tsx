import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  FilterTabs,
  Flash,
  SearchBox,
  TextArea,
  Toolbar,
  cellClass,
  rowClass,
  type Tone,
  RowActions,
  RowDelete,
  RowLink,
} from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import {
  deleteCategoryAction,
  deleteTagAction,
  saveCategoryAction,
  saveTagAction,
} from "@/app/admin/actions/content";
import { queryParam } from "@/lib/http";
import { listHref, pick } from "@/lib/admin/list";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";
const TYPES = ["category", "tag", "hidden"] as const;

type Row = {
  id: string;
  kind: "category" | "tag" | "hidden";
  name: string;
  path: string;
  posts: number;
  editKind: "category" | "tag";
};

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const T = tr(await getLocale());
  const q = queryParam(params.q).toLowerCase();
  const type = pick(params.type, TYPES);
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
  ]);
  const rows: Row[] = [
    ...categories.map((c) => ({
      id: c.id,
      kind: c.hidden ? ("hidden" as const) : ("category" as const),
      name: c.name,
      path: `/categories/${c.slug}`,
      posts: c._count.posts,
      editKind: "category" as const,
    })),
    ...tags.map((x) => ({
      id: x.id,
      kind: x.hidden ? ("hidden" as const) : ("tag" as const),
      name: x.name,
      path: `/tags/${x.slug}`,
      posts: x._count.posts,
      editKind: "tag" as const,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const matches = (row: Row) => !q || row.name.toLowerCase().includes(q) || row.path.includes(q);
  const searched = rows.filter(matches);
  const visible = searched.filter((row) => !type || row.kind === type);
  const countOf = (kind: Row["kind"]) => searched.filter((row) => row.kind === kind).length;
  const tab = (label: string, value: string, count: number) => ({
    label,
    count,
    href: listHref("/admin/categories", { q, type: value }),
    active: type === value,
  });

  // Form: ?new=category|tag creates, ?edit=<id> edits that item (kind is found from the id).
  const editingCategory = params.edit ? categories.find((c) => c.id === params.edit) : undefined;
  const editingTag = params.edit ? tags.find((x) => x.id === params.edit) : undefined;
  const formKind: "category" | "tag" | null = editingCategory
    ? "category"
    : editingTag
      ? "tag"
      : params.new === "category" || params.new === "tag"
        ? params.new
        : null;
  const editing = editingCategory ?? editingTag;

  const tone: Record<Row["kind"], Tone> = {
    category: "success",
    tag: "warning",
    hidden: "neutral",
  };
  const kindLabel: Record<Row["kind"], string> = {
    category: T("taxonomy.kindCategory"),
    tag: T("taxonomy.kindTag"),
    hidden: T("taxonomy.kindHidden"),
  };

  return (
    <>
      <PageHeader
        title={T("taxonomy.title")}
        action={
          <>
            <Link href="/admin/categories?new=tag">
              <Button variant="secondary" icon={Plus}>
                {T("tags.new")}
              </Button>
            </Link>
            <Link href="/admin/categories?new=category">
              <Button icon={Plus}>{T("categories.new")}</Button>
            </Link>
          </>
        }
      />
      <Flash ok={params.ok} error={params.error} />

      {formKind ? (
        <Card className="mb-6 max-w-xl">
          <h2 className="mb-3 text-base font-semibold text-ink">
            {formKind === "category"
              ? editing
                ? T("categories.edit")
                : T("categories.new")
              : editing
                ? T("tags.edit")
                : T("tags.new")}
          </h2>
          <form
            action={formKind === "category" ? saveCategoryAction : saveTagAction}
            className="space-y-4"
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field
              label={T("common.name")}
              name="name"
              required
              defaultValue={editing?.name}
              maxLength={100}
            />
            <Field
              label={T("common.slug")}
              name="slug"
              defaultValue={editing?.slug}
              maxLength={80}
              hint={T("taxonomy.nameHint")}
            />
            {formKind === "category" ? (
              <>
                <TextArea
                  label={T("taxonomy.descriptionLabel")}
                  name="description"
                  rows={3}
                  defaultValue={editingCategory?.description}
                />
                <TextArea
                  label={T("taxonomy.metaLabel")}
                  name="seoDescription"
                  rows={2}
                  defaultValue={editingCategory?.seoDescription}
                />
              </>
            ) : null}
            <div className="flex gap-2">
              <Button>{editing ? T("common.save") : T("common.create")}</Button>
              <Link href="/admin/categories">
                <Button variant="secondary" type="button">
                  {T("common.cancel")}
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      ) : null}

      <Toolbar>
        <FilterTabs
          label={T("ui.type")}
          tabs={[
            tab(T("ui.all"), "", searched.length),
            tab(T("taxonomy.tabCategory"), "category", countOf("category")),
            tab(T("taxonomy.tabTag"), "tag", countOf("tag")),
            tab(T("taxonomy.tabHidden"), "hidden", countOf("hidden")),
          ]}
        />
        <SearchBox placeholder={T("taxonomy.searchHint")} defaultValue={q} hidden={{ type }} />
      </Toolbar>
      <DataTable
        title={T("taxonomy.listTitle")}
        head={[
          T("common.name"),
          T("ui.type"),
          T("ui.path"),
          T("common.posts"),
          { label: "", className: "w-32" },
        ]}
        empty={visible.length === 0 ? T("categories.none") : undefined}
      >
        {visible.map((row) => (
          <tr key={`${row.editKind}-${row.id}`} className={rowClass}>
            <td className={`${cellClass} font-medium`}>{row.name}</td>
            <td className={cellClass}>
              <Badge tone={tone[row.kind]}>{kindLabel[row.kind]}</Badge>
            </td>
            <td className={`${cellClass} text-ink-2`}>{row.path}</td>
            <td className={`${cellClass} text-ink-3`}>
              {T("taxonomy.postCount", { n: row.posts })}
            </td>
            <td className={`${cellClass} whitespace-nowrap`}>
              <RowActions>
                <RowLink href={`/admin/categories?edit=${row.id}`} icon={Pencil}>
                  {T("common.edit")}
                </RowLink>
                <RowDelete
                  action={row.editKind === "category" ? deleteCategoryAction : deleteTagAction}
                  message={
                    row.editKind === "category"
                      ? T("categories.deleteConfirm", { name: row.name })
                      : T("tags.deleteConfirm", { name: row.name })
                  }
                  fields={{ id: row.id }}
                  label={`${T("common.delete")}: ${row.name}`}
                />
              </RowActions>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
