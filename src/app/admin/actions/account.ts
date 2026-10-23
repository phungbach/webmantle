"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { audit, requestMeta } from "@/lib/audit";
import { attempt, backWith, formString, tm } from "@/app/admin/actions/shared";

const PASSWORD_PAGE = "/admin/account/password";
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

/** Any signed-in user may change their own password. Needs the current one to confirm. */
export async function changePasswordAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  // The shared demo account keeps its password, so nobody can lock the others out.
  if (user.role === "viewer") backWith(PASSWORD_PAGE, "error", await tm("account.password.viewer"));

  const current = formString(formData, "currentPassword");
  const next = formString(formData, "newPassword");
  const confirm = formString(formData, "confirmPassword");

  if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH)
    backWith(PASSWORD_PAGE, "error", await tm("account.password.tooShort"));
  if (next !== confirm) backWith(PASSWORD_PAGE, "error", await tm("account.password.mismatch"));

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const valid = await verifyPassword(current, record?.passwordHash ?? null);
  if (!valid) backWith(PASSWORD_PAGE, "error", await tm("account.password.wrong"));

  const result = await attempt("change-password", async () => {
    const passwordHash = await hashPassword(next);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit({
      actorId: user.id,
      action: "auth.password-changed",
      targetType: "user",
      targetId: user.id,
      ...(await requestMeta()),
    });
  });
  if (!result.ok) backWith(PASSWORD_PAGE, "error", result.message);

  backWith(PASSWORD_PAGE, "ok", await tm("account.password.changed"));
}
