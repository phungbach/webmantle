// Addresses an editor may insert. Anything else (javascript:, data:, protocol-relative //host) is refused.
// The server sanitizer enforces the same rules on save, so this check is for immediate feedback.
export function isSafeLinkUrl(value: string): boolean {
  const url = value.trim();
  if (url.length === 0 || url.length > 500 || /[\s\u0000-\u001f]/.test(url)) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/")) return true;
  return /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(url);
}
