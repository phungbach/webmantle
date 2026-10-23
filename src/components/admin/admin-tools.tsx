import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n";
import { AccountMenu } from "@/components/admin/account-menu";

// Top-right cluster of every admin page: language switch (VI | EN) and the avatar menu.
// Plain links for the language, so the switch does a full page load (see /language route).
export async function AdminTools() {
  const user = await getCurrentUser();
  if (!user) return null;
  const locale = await getLocale();
  const T = tr(locale);
  return (
    <div className="flex items-center gap-3">
      <nav
        aria-label={locale === "vi" ? "Ngôn ngữ" : "Language"}
        className="flex rounded-full border border-line-strong bg-white p-0.5 text-xs font-semibold"
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
      <AccountMenu
        name={user.name}
        role={T(`admin.role.${user.role}` as "admin.role.admin")}
        email={user.email}
        labels={{
          changePassword: T("admin.account.changePassword"),
          signOut: T("admin.signOut"),
          open: T("admin.account.open"),
        }}
      />
    </div>
  );
}
