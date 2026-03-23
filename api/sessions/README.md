# Sessions

Sessions preserve the complete message history of an agent conversation. Each message in the history (user, assistant, or tool result) is persisted as one or more files on disk, with file extensions chosen so that content is human-readable and renderable by standard tools (markdown for text, native image formats for images, JSON only where structured data is unavoidable).

## Turn indexing

Every message occupies a single **turn index** — a zero-padded 4-digit integer (e.g. `0000`, `0001`, …, `9999`). This guarantees that alphabetical sort of filenames within the session folder is also chronological sort. Files belonging to the same turn may appear in any order relative to each other, but turns themselves always sort correctly.

The next turn index is determined by scanning the session folder for the highest existing index and incrementing by one.

## File naming

Each turn produces one or more files. The filename always starts with the padded turn index, followed by the role and content-type suffix. When a turn contains only one block of a given type, the suffix is bare (e.g. `-text`). When there are multiple blocks of the same type, a secondary index is appended without padding (e.g. `-text0`, `-text1`, `-image0`, `-image1`).

## User messages

A simple string user message produces a single file with no meta:

```
0000-user.md
```

A user message with array content (text and/or images) produces one file per content block plus a meta file:

```
0005-user-text.md           # single text block (no index)
0005-user-image.png         # single image (no index), extension from mime type
0005-user-meta.json

0008-user-text.md           # single text, two images → images get indices
0008-user-image0.png
0008-user-image1.jpg
0008-user-meta.json
```

## Assistant messages

Assistant filenames include the model name (sanitized for filesystem safety: non-alphanumeric characters other than `-` and `_` become `_`). Every assistant turn produces a `-meta.json`.

```
0001-assistant-claude-4-opus-thinking.md
0001-assistant-claude-4-opus-text.md
0001-assistant-claude-4-opus-toolcall.json
0001-assistant-claude-4-opus-meta.json
```

With multiple blocks of the same type:

```
0004-assistant-claude-4-opus-toolcall0.json
0004-assistant-claude-4-opus-toolcall1.json
0004-assistant-claude-4-opus-meta.json
```

## Tool result messages

Tool result filenames include the tool name (also sanitized). Every tool result turn produces a `-meta.json`.

```
0002-toolresult-read_file-text.md
0002-toolresult-read_file-meta.json

0006-toolresult-screenshot-text.md
0006-toolresult-screenshot-image.png
0006-toolresult-screenshot-meta.json
```

## Content file formats

| Content type                 | Extension                                                | Format         | Notes                                                  |
| ---------------------------- | -------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| Text (`TextContent`)         | `.md`                                                    | UTF-8 markdown | The `text` field written as-is                         |
| Thinking (`ThinkingContent`) | `.md`                                                    | UTF-8 markdown | The `thinking` field written as-is                     |
| Image (`ImageContent`)       | `.png`, `.jpg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.tiff` | Native binary  | Decoded from base64; extension derived from `mimeType` |
| Tool call (`ToolCall`)       | `.json`                                                  | JSON           | Contains `{ id, name, arguments }` only                |

## Meta files

Each turn with array content (or any assistant/tool-result turn) produces a `-meta.json` file that stores structured data needed to reconstruct the original `Message` object but that doesn't belong in human-readable content files.

**User meta** (`-user-meta.json`):

```json
{
  "role": "user",
  "timestamp": 1719000000000,
  "contentOrder": ["0005-user-text.md", "0005-user-image.png"]
}
```

**Assistant meta** (`-assistant-<model>-meta.json`):

```json
{
  "role": "assistant",
  "api": "anthropic-messages",
  "provider": "anthropic",
  "model": "claude-4-opus",
  "responseId": "resp_xyz",
  "usage": {
    "input": 100,
    "output": 50,
    "cacheRead": 0,
    "cacheWrite": 0,
    "totalTokens": 150,
    "cost": { "…": "…" }
  },
  "stopReason": "toolUse",
  "timestamp": 1719000001000,
  "contentOrder": [
    "0001-assistant-claude-4-opus-thinking.md",
    "0001-assistant-claude-4-opus-text.md",
    "0001-assistant-claude-4-opus-toolcall.json"
  ],
  "textSignatures": { "0001-assistant-claude-4-opus-text.md": "sig-abc" },
  "thinkingSignatures": {
    "0001-assistant-claude-4-opus-thinking.md": {
      "signature": "sig-def",
      "redacted": false
    }
  },
  "toolCallSignatures": {
    "0001-assistant-claude-4-opus-toolcall.json": "sig-ghi"
  }
}
```

The `contentOrder` array preserves the original ordering of content blocks, since the message's content array order matters for API replay. The signature maps store opaque tokens needed for multi-turn API continuity (text signatures, thinking signatures, and tool call thought signatures), keyed by filename.

**Tool result meta** (`-toolresult-<tool>-meta.json`):

```json
{
  "role": "toolResult",
  "toolCallId": "call_abc123",
  "toolName": "read_file",
  "isError": false,
  "details": {},
  "timestamp": 1719000002000,
  "contentOrder": ["0002-toolresult-read_file-text.md"]
}
```

## Session directory structure

Sessions are written to the `.sessions` directory inside the branch root (provided externally). A fully populated `.sessions` directory looks like:

```
.sessions/
├── .gitignore
├── .gitattributes
├── optimusprime-V1StGXR8_Z5jdHi6B-myT/
│   ├── 0000-user.md
│   ├── 0001-assistant-claude-4-opus-thinking.md
│   ├── 0001-assistant-claude-4-opus-text.md
│   ├── 0001-assistant-claude-4-opus-toolcall.json
│   ├── 0001-assistant-claude-4-opus-meta.json
│   ├── 0002-toolresult-read_file-text.md
│   ├── 0002-toolresult-read_file-meta.json
│   ├── 0003-assistant-claude-4-opus-text.md
│   ├── 0003-assistant-claude-4-opus-meta.json
│   ├── 0004-user-text.md
│   ├── 0004-user-image.png
│   └── 0004-user-meta.json
├── optimusprime-V1StGXR8_Z5jdHi6B-myT.zip
└── optimusprime-V1StGXR8_Z5jdHi6B-myT.json
```

## Session identification

Sessions are identified by a GUID composed of a random robot name (from [`./release/api/utils/robots.ts`](./release/api/utils/robots.ts)) and a `nanoid`, e.g. `optimusprime-V1StGXR8_Z5jdHi6B-myT`.

## Git integration

On first session creation, the following files are written to `.sessions/` if they don't already exist:

**`.gitignore`** — ignores all files inside session subfolders while preserving `.zip` and `.json` files that are immediate children of `.sessions/`:

```gitignore
# Ignore everything inside session subfolders
*/*

# But keep zip archives and JSON metadata that are direct children
!*.zip
!*.json
```

**`.gitattributes`** — marks zip files for git-lfs tracking:

```gitattributes
# Track zip files with git-lfs
*.zip filter=lfs diff=lfs merge=lfs -text
```

It can be assumed that git-lfs has already been initialized by an earlier step in the process.

## Zip archive (`<guid>.zip`)

Each session has a companion zip archive that mirrors the contents of the session folder. This archive is maintained incrementally: on session initialization, an archive is created containing just the empty session folder entry. On each message addition, the new files are individually appended to the existing archive using the system `zip` command (which updates in-place, writing only the new entry data and the central directory — O(new entry size) regardless of archive size). The archive is never rebuilt from scratch.

The zip can be used to download or transfer a complete session without depending on the internal folder structure. If the session folder is not present on disk (e.g. after a clean checkout where `.gitignore` excluded it), the archive can be extracted to reconstruct it before loading messages.

## Session metadata (`<guid>.json`)

Each session has a top-level JSON metadata file containing:

```json
{
  "sessionId": "optimusprime-V1StGXR8_Z5jdHi6B-myT",
  "branch": "main",
  "commitAtCreation": "abc1234",
  "accumulatedCost": 0.042,
  "lastUserMessage": "Fix the login bug",
  "parent": {
    "sessionId": "walle-xYz789AbCdEf",
    "reason": "compaction"
  }
}
```

| Field              | Updated                   | Description                                                                                    |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `sessionId`        | At creation               | The session GUID                                                                               |
| `branch`           | At creation               | Git branch at time of creation                                                                 |
| `commitAtCreation` | At creation               | HEAD commit hash at time of creation                                                           |
| `accumulatedCost`  | On each assistant message | Running total of `usage.cost.total` from assistant messages                                    |
| `lastUserMessage`  | On each user message      | First 200 characters of the most recent user message's text content (for human identification) |
| `parent`           | At creation (optional)    | Reference to a parent session, with a `reason` of either `"copy"` or `"compaction"`            |

Creation and modification timestamps are assumed to be extractable from file system attributes and are not stored in the metadata.

## Loading a session

When continuing a session, the message history is reconstructed from disk:

1. If the session folder does not exist on disk, the session's zip archive is extracted to recreate it.
2. All files in the session folder are read and grouped by turn index (parsed from the leading digits of each filename).
3. For each turn group, the `-meta.json` (if present) determines the message role and drives reconstruction. The `contentOrder` array dictates the sequence in which content blocks are reassembled. Image files are re-encoded to base64. Simple string user messages (single `.md`, no meta) are handled as a special case.
4. The reconstructed `Message[]` array is returned in turn-index order, ready to be provided as context to the LLM.

## Session compaction

When the message history grows too long for an LLM's context window, a **compaction** occurs. This creates a new session with:

- A `parent` reference pointing to the old session with reason `"compaction"`
- A set of seed messages (typically a summary of the prior conversation) produced by the caller's context-window management layer
- The accumulated cost carried forward from the old session

The compaction strategy (how to summarize the old history) is the responsibility of the caller — the session system only handles creating the new session and writing the seed messages.

## Session copy

A full copy of a session can be created, which duplicates all messages into a new session with a `parent` reference (reason `"copy"`).

## Session lifecycle summary

| Operation       | What happens on disk                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create**      | `.sessions/` scaffolded (`.gitignore`, `.gitattributes`), `<id>/` folder created, `<id>.zip` initialized with folder entry, `<id>.json` metadata written |
| **Add message** | Content files + meta written to `<id>/`, each file appended to `<id>.zip`, `<id>.json` updated (cost, last user message)                                 |
| **Load**        | `<id>/` read from disk (or extracted from zip), files grouped by turn index and deserialized into `Message[]`                                            |
| **Compact**     | New session created with parent ref, seed messages written via standard add-message flow                                                                 |
| **Copy**        | New session created with parent ref, all messages from source replayed via add-message                                                                   |
| **List**        | All `*.json` files in `.sessions/` scanned and parsed as metadata                                                                                        |
