import * as path from "node:path";
import * as fs from "node:fs/promises";
import { nanoid } from "nanoid";
import { randomName } from "../utils/robots";
import { writeUtf8IfMissing } from "../utils/fs";
import { addFileToArchive } from "../utils/zip";
import type { Message, TextContent } from "@mariozechner/pi-ai";

const CONSTANTS = {
  /** Number of digits used when zero-padding turn indices.
   *  4 digits → 0000–9999, which is plenty for any conversation and ensures
   *  that alphabetical sort === chronological sort (e.g. "0009" < "0010"). */
  TURN_INDEX_PAD: 4,
  SESSIONS_DIR: ".sessions",
  FILE_CONTENT: {
    GITIGNORE: `# Ignore everything inside session subfolders
*/*

# But keep zip archives and JSON metadata that are direct children
!*.zip
!*.json
`,
    GITATTRIBUTES: `# Track zip files with git-lfs
*.zip filter=lfs diff=lfs merge=lfs -text
`,
  },
} as const;

/**
 * Zero-pad a turn index so that alphabetical sorting matches numerical order.
 *
 * @example padTurnIndex(3)  // "0003"
 * @example padTurnIndex(42) // "0042"
 */
export const padTurnIndex = (index: number): string =>
  String(index).padStart(CONSTANTS.TURN_INDEX_PAD, "0");

/**
 * Return the suffix with or without a secondary index:
 *   totalOfType === 1 → "text"
 *   totalOfType >  1 → "text0", "text1", …
 */
export const indexedSuffix = (base: string, idx: number, totalOfType: number) =>
  totalOfType > 1 ? `${base}${idx}` : base;

export function parseTurnIndex(filename: string): number | null {
  const m = filename.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Generate a unique session identifier using a random robot name and a nanoid.
 *
 * @returns e.g. "optimus-prime-V1StGXR8_Z5jdHi6B-myT"
 */
export const generateSessionId = () => `${randomName()}-${nanoid()}`;

/**
 * Return the absolute path to the `.sessions` directory given a branch root.
 */
export const sessionsRoot = (branchRoot: string): string =>
  path.join(branchRoot, CONSTANTS.SESSIONS_DIR);

/**
 * Return the absolute path to a specific session's folder.
 */
export const sessionDir = (branchRoot: string, sessionId: string): string =>
  path.join(sessionsRoot(branchRoot), sessionId);

/**
 * Return the absolute path to a session's zip archive.
 */
export const sessionZipPath = (branchRoot: string, sessionId: string): string =>
  path.join(sessionsRoot(branchRoot), `${sessionId}.zip`);

/**
 * Return the absolute path to a session's metadata JSON file.
 */
export const sessionMetadataPath = (
  branchRoot: string,
  sessionId: string,
): string => path.join(sessionsRoot(branchRoot), `${sessionId}.json`);

/**
 * Ensures that the `.sessions` directory exists at the given branch root,
 * and that it contains the necessary `.gitignore` and `.gitattributes` files to keep session data out of git history while allowing metadata and zip archives to be tracked.
 * @param branchRoot
 */
export async function ensureSessionsDirectory(
  branchRoot: string,
): Promise<void> {
  const dir = sessionsRoot(branchRoot);
  await fs.mkdir(dir, { recursive: true });
  await writeUtf8IfMissing(
    { dir, filename: ".gitignore" },
    CONSTANTS.FILE_CONTENT.GITIGNORE,
  );
  await writeUtf8IfMissing(
    { dir, filename: ".gitattributes" },
    CONSTANTS.FILE_CONTENT.GITATTRIBUTES,
  );
}

/**
 * Initializes a zip archive for a session, that simply contains the empty session folder as its only entry.
 * This ensures the archive exists from the start and can be safely added to with `addFileToZip` as messages are added to the session.
 * @param branchRoot
 * @param sessionId
 * @returns
 */
export const createSessionArchive = async (
  branchRoot: string,
  sessionId: string,
) => addFileToArchive(sessionZipPath(branchRoot, sessionId), sessionId);

export const addToSessionArchive = async (
  branchRoot: string,
  sessionId: string,
  filename: string,
) =>
  addFileToArchive(
    sessionZipPath(branchRoot, sessionId),
    path.join(sessionId, filename),
  );

/**
 * Scan an existing session directory and return the next turn index to use.
 * If the directory is empty or doesn't exist, returns 0.
 */
export async function getNextTurnIndex(dir: string): Promise<number> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return 0;
  }

  let maxIndex = -1;
  for (const file of files) {
    const idx = parseTurnIndex(file);
    if (idx !== null && idx > maxIndex) maxIndex = idx;
  }
  return maxIndex + 1;
}

export function extractUserTextPreview(msg: Message): string | null {
  if (msg.role !== "user") return null;

  const text =
    typeof msg.content === "string"
      ? msg.content
      : msg.content.find((c): c is TextContent => c.type === "text")?.text ??
        "";

  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}
