import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { isAllowedThemeFile, LIMITS } from "@/lib/themes/contract";

export class ArchiveError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "ArchiveError";
  }
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;

/** Rejects names that could escape the target directory or confuse the filesystem. */
export function assertSafeEntryName(name: string): void {
  if (name.length === 0 || name.length > 200)
    throw new ArchiveError(`Invalid entry name length`, "path");
  if (name.includes("\\") || name.includes("\0"))
    throw new ArchiveError("Entry name contains a backslash or NUL byte", "path");
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name))
    throw new ArchiveError("Absolute paths are not allowed", "path");
  const segments = name.replace(/\/$/, "").split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new ArchiveError("Path traversal or empty path segment detected", "path");
    }
    if (segment.startsWith("."))
      throw new ArchiveError("Hidden files are not allowed in themes", "hidden");
  }
}

/** yauzl reports unsafe names with its own messages. Translate them so callers see the real reason. */
function toArchiveError(error: unknown): ArchiveError {
  const message = error instanceof Error ? error.message : "";
  if (/relative path|absolute path|invalid characters/i.test(message)) {
    return new ArchiveError("Entry name is not a safe relative path", "path");
  }
  return new ArchiveError("Malformed ZIP archive", "format");
}

/**
 * Extracts a theme ZIP into `destination` (which must exist and be empty).
 * Enforces: magic bytes, entry count, per-file and total size, compression ratio,
 * no symlinks, no duplicate names, and an allow-list of file types.
 * Returns the list of extracted relative paths.
 */
export async function extractThemeArchive(buffer: Buffer, destination: string): Promise<string[]> {
  if (buffer.length > LIMITS.uploadBytes)
    throw new ArchiveError("Archive is larger than 5 MB", "size");
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new ArchiveError("File is not a ZIP archive", "format");
  }

  const base = path.resolve(destination);
  const written: string[] = [];

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: false },
      (err, z) => {
        if (err || !z) reject(new ArchiveError("Malformed ZIP archive", "format"));
        else resolve(z);
      }
    );
  });

  let entryCount = 0;
  let totalUncompressed = 0;
  const seen = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    let failed = false;
    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      zip.close();
      reject(error instanceof ArchiveError ? error : toArchiveError(error));
    };

    zip.on("error", fail);
    zip.on("end", () => {
      if (!failed) resolve();
    });

    zip.on("entry", (entry: yauzl.Entry) => {
      try {
        entryCount += 1;
        if (entryCount > LIMITS.archiveEntries)
          throw new ArchiveError("Archive has too many entries", "limits");

        const name = entry.fileName;
        assertSafeEntryName(name);

        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        const type = mode & S_IFMT;
        if (type === S_IFLNK) throw new ArchiveError("Symbolic links are not allowed", "symlink");

        const isDirectory = name.endsWith("/") || type === S_IFDIR;
        if (seen.has(name.toLowerCase()))
          throw new ArchiveError("Duplicate entry name", "duplicate");
        seen.add(name.toLowerCase());

        if (entry.uncompressedSize > LIMITS.entryUncompressedBytes) {
          throw new ArchiveError("A file inside the archive is too large", "limits");
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > LIMITS.totalUncompressedBytes) {
          throw new ArchiveError("Archive expands beyond the allowed size", "bomb");
        }
        if (
          entry.compressedSize > 0 &&
          entry.uncompressedSize / entry.compressedSize > LIMITS.maxCompressionRatio
        ) {
          throw new ArchiveError("Suspicious compression ratio (possible archive bomb)", "bomb");
        }

        const target = path.resolve(base, name);
        if (target !== base && !target.startsWith(base + path.sep)) {
          throw new ArchiveError("Entry resolves outside the theme directory", "path");
        }

        if (isDirectory) {
          fs.mkdirSync(target, { recursive: true });
          zip.readEntry();
          return;
        }

        if (!isAllowedThemeFile(name)) {
          throw new ArchiveError(`File type or location not allowed: ${name}`, "type");
        }

        fs.mkdirSync(path.dirname(target), { recursive: true });
        zip.openReadStream(entry, (openErr, stream) => {
          if (openErr || !stream)
            return fail(new ArchiveError("Could not read archive entry", "format"));

          let bytes = 0;
          const out = fs.createWriteStream(target, { flags: "wx", mode: 0o644 });
          stream.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            // Trust the actual bytes, not the declared size.
            if (bytes > LIMITS.entryUncompressedBytes) {
              stream.destroy();
              out.destroy();
              fail(new ArchiveError("A file inside the archive is too large", "bomb"));
            }
          });
          stream.on("error", fail);
          out.on("error", fail);
          out.on("finish", () => {
            written.push(name);
            zip.readEntry();
          });
          stream.pipe(out);
        });
      } catch (error) {
        fail(error);
      }
    });

    zip.readEntry();
  });

  return written;
}

/** Finds symlinks or unexpected entries that were created on disk, for defence in depth. */
export function findSymlinks(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) found.push(path.relative(dir, full));
      else if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return found;
}
