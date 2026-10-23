// Serializes theme lifecycle operations (install, activate, rollback, uninstall) in this process.
// SQLite also serializes writes, but the filesystem work around them must not interleave.
let tail: Promise<unknown> = Promise.resolve();

export function withThemeLock<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}
