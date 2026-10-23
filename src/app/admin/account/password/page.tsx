import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Button, Card, Field, Flash } from "@/components/admin/ui";
import { PageHeader } from "@/components/admin/page-header";
import { changePasswordAction } from "@/app/admin/actions/account";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/account/password");
  const params = await searchParams;
  const locale = await getLocale();
  const T = tr(locale);
  return (
    <>
      <PageHeader
        title={T("account.password.title")}
        description={T("account.password.description")}
      />
      <Flash ok={params.ok} error={params.error} />
      <Card className="max-w-md">
        <form action={changePasswordAction} className="space-y-4">
          <Field
            label={T("account.password.current")}
            name="currentPassword"
            type="password"
            required
          />
          <Field
            label={T("account.password.new")}
            name="newPassword"
            type="password"
            required
            maxLength={256}
            hint={T("account.password.hint")}
          />
          <Field
            label={T("account.password.confirm")}
            name="confirmPassword"
            type="password"
            required
            maxLength={256}
          />
          <Button>{T("account.password.submit")}</Button>
        </form>
      </Card>
    </>
  );
}
