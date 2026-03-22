import { statSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export function getFileCreationDate(filePath: string): Date {
  const stats = statSync(filePath);
  // `birthtime` is the creation time on macOS/Windows.
  // On Linux, it may fall back to `mtime` (last modified) if birthtime is unavailable.
  return stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;
}

type PathComponents = Record<"dir" | "filename", string>;
type PathOrComponents = string | PathComponents;

const fullPath = (pathOrComponents: PathOrComponents): string =>
  typeof pathOrComponents === "string"
    ? pathOrComponents
    : path.join(pathOrComponents.dir, pathOrComponents.filename);

export async function writeUtf8(path: string, content: string): Promise<void>;
export async function writeUtf8(
  components: PathComponents,
  content: string,
): Promise<void>;
export async function writeUtf8(
  pathOrComponents: PathOrComponents,
  content: string,
): Promise<void>;
export async function writeUtf8(
  pathOrComponents: PathOrComponents,
  content: string,
) {
  const dir =
    typeof pathOrComponents === "string"
      ? path.dirname(pathOrComponents)
      : pathOrComponents.dir;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath(pathOrComponents), content, "utf-8");
}

export async function readUtf8(path: string): Promise<string>;
export async function readUtf8(components: PathComponents): Promise<string>;
export async function readUtf8(components: PathOrComponents): Promise<string>;
export async function readUtf8(
  pathOrComponents: PathOrComponents,
): Promise<string> {
  return fs.readFile(fullPath(pathOrComponents), "utf-8");
}

/**
 * Write `content` to `filePath` only when the file does not yet exist.
 */
export async function writeUtf8IfMissing(
  path: string,
  content: string,
): Promise<void>;
export async function writeUtf8IfMissing(
  components: PathComponents,
  content: string,
): Promise<void>;
export async function writeUtf8IfMissing(
  pathOrComponents: string | PathComponents,
  content: string,
): Promise<void> {
  try {
    await fs.access(fullPath(pathOrComponents));
  } catch {
    await writeUtf8(pathOrComponents, content);
  }
}

export interface FileEntry {
  filename: string;
  content: string | Buffer;
}

export async function writeFileEntry(
  dir: string,
  entry: FileEntry,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, entry.filename);
  if (typeof entry.content === "string") await writeUtf8(full, entry.content);
  else await fs.writeFile(full, entry.content);
}

export async function writeJson<T>(path: string, data: T): Promise<void>;
export async function writeJson<T>(
  components: PathComponents,
  data: T,
): Promise<void>;
export async function writeJson<T>(
  pathOrComponents: string | PathComponents,
  data: T,
): Promise<void> {
  await writeUtf8(pathOrComponents, JSON.stringify(data, null, 2));
}

export async function readJson<T>(path: string): Promise<T>;
export async function readJson<T>(components: PathComponents): Promise<T>;
export async function readJson<T>(
  pathOrComponents: PathOrComponents,
): Promise<T>;
export async function readJson<T>(
  pathOrComponents: PathOrComponents,
): Promise<T> {
  const content = await readUtf8(pathOrComponents);
  return JSON.parse(content) as T;
}

/** Replace filesystem-unsafe characters with underscores. */
export const sanitizeForFilename = (s: string) =>
  s.replace(/[^a-zA-Z0-9_-]/g, "_");
