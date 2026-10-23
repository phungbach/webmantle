import bcrypt from "bcryptjs";

// bcrypt cost 12 is a reasonable 2025+ default. Argon2id would need a native module,
// so bcryptjs (pure JavaScript) keeps installation simple on every platform.
const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

// Used when the email does not exist so response time does not reveal which accounts exist.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.G2jJ3B8KfJZp1wXk9ZV1c0gJ1Vnu";

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}
