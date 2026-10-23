/**
 * Calls a server action and turns a thrown error into a failed result. A request that is cut off
 * (the page is reloading or being left, the server restarted) rejects with "Connection closed";
 * that must not surface as an unhandled error, it is just a save that did not complete.
 */
export async function callAction<R extends { ok: boolean; message: string }>(
  call: () => Promise<R>,
  fallbackMessage: string
): Promise<R | { ok: false; message: string }> {
  try {
    return await call();
  } catch {
    return { ok: false, message: fallbackMessage };
  }
}
