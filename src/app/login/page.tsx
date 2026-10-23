import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/admin/actions/auth";
import { Button, Field, Flash } from "@/components/admin/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/settings";
import { getSiteBranding } from "@/lib/appearance";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: tr(await getLocale())("login.title"), robots: { index: false, follow: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect("/admin");
  const locale = await getLocale();
  const T = tr(locale);
  const [site, branding] = await Promise.all([getSiteSettings(), getSiteBranding()]);
  return (
    <main className="admin-shell flex min-h-screen flex-col items-center justify-center p-4">
      <nav
        aria-label={locale === "vi" ? "Ngôn ngữ" : "Language"}
        className="absolute right-6 top-5 flex rounded-full border border-line-strong bg-white p-0.5 text-xs font-semibold"
      >
        {(["vi", "en"] as const).map((code) => (
          <a
            key={code}
            href={`/language?lang=${code}`}
            aria-current={locale === code ? "true" : undefined}
            className={`rounded-full px-3 py-1 ${
              locale === code ? "bg-ink text-white" : "text-ink-3 hover:text-ink"
            }`}
          >
            {code.toUpperCase()}
          </a>
        ))}
      </nav>
      <div className="mb-6 flex items-center gap-2.5 text-lg font-semibold text-ink">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-control object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-600 text-base font-semibold text-white"
          >
            {site.siteTitle.trim().charAt(0).toUpperCase() || "W"}
          </span>
        )}
        {site.siteTitle}
      </div>
      <div className="w-full max-w-sm rounded-card border border-line bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <h1 className="mb-6 text-[22px] font-semibold tracking-tight text-ink">
          {T("login.title")}
        </h1>
        <Flash error={params.error} />
        <form action={loginAction} className="space-y-4">
          <Field label={T("login.email")} name="email" type="email" required />
          <Field label={T("login.password")} name="password" type="password" required />
          <Button className="w-full justify-center">{T("login.submit")}</Button>
        </form>
      </div>
    </main>
  );
}
