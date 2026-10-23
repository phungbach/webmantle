import { redirect } from "next/navigation";
import { listHref } from "@/lib/admin/list";

export const dynamic = "force-dynamic";

// Categories and tags share one screen. This keeps old links working.
export default async function TagsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  redirect(listHref("/admin/categories", { type: "tag", ok: params.ok, error: params.error }));
}
