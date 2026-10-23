import fs from "node:fs";
import path from "node:path";

/**
 * Reads KEY=value lines (quotes allowed, `#` comments, optional `export`). Used by command-line scripts
 * such as the seed and the backup, which run outside Next.js and so do not get `.env` loaded for them.
 */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as string;
    let value = (match[2] ?? "").trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1));
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[key] = value;
  }
  return out;
}

/** Loads `.env` from the working directory. Values already in the environment always win. */
export function loadEnvFile(file = path.join(process.cwd(), ".env")) {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();
