/**
 * Hides personal data (email addresses and IP addresses) in text shown to the read-only demo account,
 * which anyone can open. Administrators and editors see the real values.
 */
export function maskPrivate(text: string): string {
  return text
    .replace(/([\w.+-])[\w.+-]*@([\w-])[\w-]*(\.[\w.]+)/g, "$1***@$2***$3")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "•••.•••.•••.•••")
    .replace(/\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]*/gi, "••••:••••");
}

export function isReadOnlyRole(role: string | undefined): boolean {
  return role === "viewer";
}
