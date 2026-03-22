import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
} from "@mariozechner/pi-ai";
import {
  createSessionArchive,
  ensureSessionsDirectory,
  extractUserTextPreview,
  generateSessionId,
  getNextTurnIndex,
  parseTurnIndex,
  sessionDir,
  sessionMetadataPath,
  sessionsRoot,
  sessionZipPath,
} from "./common";
import { deserialize, serialize } from "./serialization";
import { readJson, writeFileEntry, writeJson } from "../utils/fs";
import { addFileToArchive, extractArchive } from "../utils/zip";

export namespace Session {
  export type ParentReference = {
    sessionId: string;
    reason: "copy" | "compaction";
  };

  export type Metadata = {
    sessionId: string;
    branch: string;
    commitAtCreation: string;
    accumulatedCost: number;
    lastUserMessage: string;
    parent?: ParentReference;
  };

  export interface Handle {
    /** The unique session identifier (robotName-nanoid). */
    id: string;
    /** Absolute path to the branch root that owns this session. */
    branchRoot: string;
    /** The next turn index to use when adding a message. */
    nextTurnIndex: number;
    /** In-memory copy of the metadata (kept in sync with disk). */
    metadata: Metadata;
  }

  export interface CreateOpts {
    branchRoot: string;
    /** ← EXTERNAL: current git branch name */
    branch: string;
    /** ← EXTERNAL: HEAD commit hash at time of creation */
    commitAtCreation: string;
    parent?: ParentReference;
  }
}

export namespace Meta {
  type WithContentOrder<T = {}> = T & {
    /** Filenames of content files in their original order. */
    contentOrder: string[];
  };

  export type User = Pick<UserMessage, "role" | "timestamp"> & WithContentOrder;

  export type Assistant = Pick<
    AssistantMessage,
    | "role"
    | "api"
    | "provider"
    | "model"
    | "responseId"
    | "usage"
    | "stopReason"
    | "errorMessage"
    | "timestamp"
  > &
    WithContentOrder & {
      /** Signatures needed for multi-turn API continuity, keyed by filename. */
      textSignatures: Record<string, string>;
      thinkingSignatures: Record<
        string,
        { signature: string; redacted: boolean }
      >;
      toolCallSignatures: Record<string, string>;
    };

  export type ToolResult<TDetails = any> = Pick<
    ToolResultMessage<TDetails>,
    "role" | "toolCallId" | "toolName" | "isError" | "timestamp" | "details"
  > &
    WithContentOrder;

  export type Turn = User | Assistant | ToolResult;
}
/**
 * Load every message in a session directory, reconstructing full `Message`
 * objects sorted by turn index.
 */
export async function loadSessionMessages(
  branchRoot: string,
  sessionId: string,
): Promise<Message[]> {
  const dir = sessionDir(branchRoot, sessionId);

  try {
    await fs.access(dir);
  } catch {
    await extractArchive(sessionZipPath(branchRoot, sessionId));
  }

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  // Group files by turn index
  const turnGroups = new Map<number, Map<string, string | Buffer>>();

  for (const file of files) {
    const idx = parseTurnIndex(file);
    if (idx === null) continue;
    if (!turnGroups.has(idx)) turnGroups.set(idx, new Map());

    const fullPath = path.join(dir, file);
    const ext = path.extname(file);
    const isBinary = ext !== ".md" && ext !== ".json";
    const content = isBinary
      ? await fs.readFile(fullPath)
      : await fs.readFile(fullPath, "utf-8");
    turnGroups.get(idx)!.set(file, content);
  }

  const sortedIndices = [...turnGroups.keys()].sort((a, b) => a - b);
  const messages: Message[] = [];
  for (const idx of sortedIndices) {
    const msg = deserialize(turnGroups.get(idx)!);
    if (msg) messages.push(msg);
  }
  return messages;
}

export async function createSession(
  opts: Session.CreateOpts,
): Promise<Session.Handle> {
  const { branchRoot, branch, commitAtCreation, parent } = opts;

  await ensureSessionsDirectory(branchRoot);
  const id = generateSessionId();
  await fs.mkdir(sessionDir(branchRoot, id), { recursive: true });
  await createSessionArchive(branchRoot, id);

  const metadata: Session.Metadata = {
    sessionId: id,
    branch,
    commitAtCreation,
    accumulatedCost: 0,
    lastUserMessage: "",
    ...(parent ? { parent } : {}),
  };

  await writeJson(sessionMetadataPath(branchRoot, id), metadata);

  return { id, branchRoot, nextTurnIndex: 0, metadata };
}

export async function loadSession(
  branchRoot: string,
  sessionId: string,
): Promise<Session.Handle> {
  const metadata = await readJson<Session.Metadata>(
    sessionMetadataPath(branchRoot, sessionId),
  );
  const nextTurnIndex = await getNextTurnIndex(
    sessionDir(branchRoot, sessionId),
  );
  return { id: sessionId, branchRoot, nextTurnIndex, metadata };
}

/**
 * Load the full, ordered message history for a session.
 * Use this to provide prior context to the LLM when continuing a session.
 */
export const getSessionHistory = (handle: Session.Handle) =>
  loadSessionMessages(handle.branchRoot, handle.id);

/**
 * Persist a `Message` to the session.
 *
 * For each content block in the message, a separate file is written with the
 * appropriate extension (.md for text/thinking, image extension for images,
 * .json for tool calls).  A `-meta.json` file captures structured data
 * (usage, signatures, tool IDs, etc.) needed to reconstruct the message.
 *
 * All files are incrementally added to the session zip, and the session
 * metadata JSON is updated.
 *
 * Returns the list of filenames written (useful for logging / debugging).
 */
export async function addMessage(
  handle: Session.Handle,
  message: Message,
): Promise<string[]> {
  const turnIndex = handle.nextTurnIndex;
  const dir = sessionDir(handle.branchRoot, handle.id);

  const fileEntries = serialize(turnIndex, message);
  for (const entry of fileEntries) await writeFileEntry(dir, entry);

  for (const entry of fileEntries)
    await addFileToArchive(
      sessionZipPath(handle.branchRoot, handle.id),
      path.join(handle.id, entry.filename),
    );

  if (message.role === "assistant")
    handle.metadata.accumulatedCost += message.usage?.cost.total ?? 0;

  const preview = extractUserTextPreview(message);
  if (preview !== null) {
    handle.metadata.lastUserMessage = preview;
  }
  await writeJson(
    sessionMetadataPath(handle.branchRoot, handle.id),
    handle.metadata,
  );

  // 5. Advance turn counter
  handle.nextTurnIndex = turnIndex + 1;

  return fileEntries.map((e) => e.filename);
}

type SessionFromExistingOpts = {
  source: Session.Handle;
  branch: string;
  commitAtCreation: string;
};

export async function copySession({
  source,
  branch,
  commitAtCreation,
}: SessionFromExistingOpts): Promise<Session.Handle> {
  const handle = await createSession({
    branchRoot: source.branchRoot,
    branch,
    commitAtCreation,
    parent: { sessionId: source.id, reason: "copy" },
  });

  const messages = await getSessionHistory(source);
  for (const msg of messages) await addMessage(handle, msg);

  return handle;
}

export async function compactSession(
  { source, branch, commitAtCreation }: SessionFromExistingOpts,
  compact: (messages: Message[]) => Promise<Message[]>,
): Promise<Session.Handle> {
  const handle = await createSession({
    branchRoot: source.branchRoot,
    branch,
    commitAtCreation,
    parent: { sessionId: source.id, reason: "compaction" },
  });

  const messages = await compact(await getSessionHistory(source));
  for (const msg of messages) await addMessage(handle, msg);

  return handle;
}

export async function listSessions(
  branchRoot: string,
): Promise<Session.Metadata[]> {
  const dir = sessionsRoot(branchRoot);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const results: Session.Metadata[] = [];
  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        results.push(
          await readJson<Session.Metadata>(
            sessionMetadataPath(branchRoot, file.replace(/\.json$/, "")),
          ),
        );
      } catch {
        /* skip corrupt metadata */
      }
    }
  }
  return results;
}
