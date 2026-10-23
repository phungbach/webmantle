import fs from "node:fs";
import path from "node:path";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { THEMES_DIR, THEME_BACKUP_DIR } from "@/lib/env";
import { ThemeError } from "@/lib/themes/errors";
import { withThemeLock } from "@/lib/themes/lock";
import { ArchiveError, extractThemeArchive } from "@/lib/themes/zip";
import { validateThemeDirectory, type ValidationReport } from "@/lib/themes/validate";
import { clearBundleCache } from "@/lib/themes/registry";
import { compareSemver, LIMITS } from "@/lib/themes/contract";
import { syncThemePages } from "@/lib/themes/theme-pages";
import { syncThemeContent } from "@/lib/themes/theme-content";

export type InstallResult = {
  id: string;
  version: string;
  previousVersion: string | null;
  report: ValidationReport;
};

/** Installs a theme uploaded as a ZIP. Nothing is written to the themes directory unless validation passes. */
export function installThemeArchive(
  buffer: Buffer,
  actorId: string | null
): Promise<InstallResult> {
  return withThemeLock(async () => {
    if (buffer.length === 0) throw new ThemeError("invalid", "The uploaded file is empty.");
    if (buffer.length > LIMITS.uploadBytes)
      throw new ThemeError("invalid", "Theme archives must be 5 MB or smaller.");
    const staging = createStagingDir();
    try {
      try {
        await extractThemeArchive(buffer, staging);
      } catch (error) {
        const message =
          error instanceof ArchiveError ? error.message : "The archive could not be read.";
        await recordRejection(null, message, actorId);
        throw new ThemeError("invalid", message);
      }
      return await commitFromStaging(staging, actorId);
    } finally {
      removeQuietly(staging);
    }
  });
}

/**
 * Installs a theme shipped with the repository (for example themes/hien-studio). The source directory is
 * copied into staging and goes through exactly the same validation as an uploaded archive.
 */
export function installThemeDirectory(
  sourceDir: string,
  actorId: string | null
): Promise<InstallResult> {
  return withThemeLock(async () => {
    const staging = createStagingDir();
    try {
      fs.cpSync(sourceDir, staging, {
        recursive: true,
        errorOnExist: false,
        force: true,
        dereference: false,
      });
      return await commitFromStaging(staging, actorId);
    } finally {
      removeQuietly(staging);
    }
  });
}

function createStagingDir(): string {
  fs.mkdirSync(THEMES_DIR, { recursive: true });
  return fs.mkdtempSync(path.join(THEMES_DIR, ".staging-"));
}

function removeQuietly(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Staging cleanup is best effort. Leftover .staging-* folders are ignored by the registry.
  }
}

async function recordRejection(themeId: string | null, message: string, actorId: string | null) {
  await prisma.themeHistory.create({
    data: { action: "validation_failed", themeId, detail: message.slice(0, 500), actorId },
  });
  await audit({
    actorId,
    action: "theme.install.rejected",
    targetType: "theme",
    targetId: themeId ?? "upload",
    detail: { message: message.slice(0, 500) },
  });
}

async function commitFromStaging(staging: string, actorId: string | null): Promise<InstallResult> {
  const report = validateThemeDirectory(staging);
  if (!report.ok || !report.manifest) {
    await recordRejection(null, report.errors.map((e) => e.message).join("; "), actorId);
    throw new ThemeError("invalid", "Theme failed validation.", report);
  }
  const manifest = report.manifest;

  const existing = await prisma.theme.findUnique({ where: { id: manifest.id } });
  if (existing && compareSemver(existing.version, manifest.version) === 0) {
    throw new ThemeError(
      "already-installed",
      `Theme "${manifest.id}" version ${manifest.version} is already installed.`
    );
  }

  const targetDir = path.join(THEMES_DIR, manifest.id, manifest.version);
  if (!isInside(THEMES_DIR, targetDir)) throw new ThemeError("invalid", "Invalid theme location.");

  // Update path: keep a backup of the outgoing version before replacing it.
  let backupPath: string | null = null;
  if (existing && fs.existsSync(existing.path)) {
    fs.mkdirSync(THEME_BACKUP_DIR, { recursive: true });
    backupPath = path.join(THEME_BACKUP_DIR, `${manifest.id}-${existing.version}-${Date.now()}`);
    fs.cpSync(existing.path, backupPath, { recursive: true });
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(staging, targetDir);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.theme.upsert({
        where: { id: manifest.id },
        create: {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          path: targetDir,
          manifestJson: JSON.stringify(manifest),
        },
        update: {
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          path: targetDir,
          manifestJson: JSON.stringify(manifest),
        },
      });
      await tx.themeHistory.create({
        data: {
          action: existing ? "update" : "install",
          themeId: manifest.id,
          detail: JSON.stringify({
            from: existing?.version ?? null,
            to: manifest.version,
            backup: backupPath ? path.basename(backupPath) : null,
          }),
          actorId,
        },
      });
    });
  } catch (error) {
    // Database write failed after the new files were moved in. The outgoing version has not
    // been deleted yet, so removing the new files restores the previous state.
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }

  // The new version is committed. Remove the outgoing files; the backup copy remains in backups/themes.
  if (existing && existing.path !== targetDir)
    fs.rmSync(existing.path, { recursive: true, force: true });

  clearBundleCache();
  await syncThemePages(manifest.id, targetDir, actorId);
  await syncThemeContent(manifest.id, targetDir, actorId);
  await audit({
    actorId,
    action: existing ? "theme.update" : "theme.install",
    targetType: "theme",
    targetId: manifest.id,
    detail: { version: manifest.version, previousVersion: existing?.version ?? null },
  });
  return {
    id: manifest.id,
    version: manifest.version,
    previousVersion: existing?.version ?? null,
    report,
  };
}

function isInside(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedBase + path.sep);
}

export { isInside };
