import Link from "next/link";
import { logoutAction } from "@/app/admin/actions/auth";

// Avatar with a small menu: account details, change password, sign out.
// <details> keeps it working without JavaScript, like the sidebar groups.
export function AccountMenu({
  name,
  role,
  email,
  labels,
}: {
  name: string;
  role: string;
  email: string;
  labels: { changePassword: string; signOut: string; open: string };
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <details className="relative">
      <summary
        aria-label={labels.open}
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
      >
        {initial}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 rounded-card border border-line bg-white p-2 shadow-lg">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-ink-3">{email}</p>
          <p className="mt-1 text-xs text-ink-2">{role}</p>
        </div>
        <div className="my-1 h-px bg-line" />
        <Link
          href="/admin/account/password"
          className="block rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink"
        >
          {labels.changePassword}
        </Link>
        <form action={logoutAction}>
          <button className="block w-full rounded-control px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50">
            {labels.signOut}
          </button>
        </form>
      </div>
    </details>
  );
}
