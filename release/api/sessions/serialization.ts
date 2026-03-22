import * as path from "node:path";
import type {
  Message,
  UserMessage,
  TextContent,
  ImageContent,
  AssistantMessage,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
} from "@mariozechner/pi-ai";
import type { Meta } from ".";
import { sanitizeForFilename, type FileEntry } from "../utils/fs.js";
import { padTurnIndex, indexedSuffix } from "./common.js";
import { extensionToMime, mimeToExtension } from "../utils/image/mime.js";

const _serialize = {
  user(turnIndex: number, msg: UserMessage): FileEntry[] {
    const pad = padTurnIndex(turnIndex);

    // Simple string → single .md, no meta
    if (typeof msg.content === "string") {
      return [{ filename: `${pad}-user.md`, content: msg.content }];
    }

    const entries: FileEntry[] = [];
    const contentOrder: string[] = [];

    const texts = msg.content.filter(
      (c): c is TextContent => c.type === "text",
    );
    const images = msg.content.filter(
      (c): c is ImageContent => c.type === "image",
    );

    let textIdx = 0;
    let imageIdx = 0;

    for (const block of msg.content) {
      if (block.type === "text") {
        const suffix = indexedSuffix("text", textIdx, texts.length);
        const fn = `${pad}-user-${suffix}.md`;
        entries.push({ filename: fn, content: block.text });
        contentOrder.push(fn);
        textIdx++;
      } else {
        const ext = mimeToExtension(block.mimeType);
        const suffix = indexedSuffix("image", imageIdx, images.length);
        const fn = `${pad}-user-${suffix}${ext}`;
        entries.push({
          filename: fn,
          content: Buffer.from(block.data, "base64"),
        });
        contentOrder.push(fn);
        imageIdx++;
      }
    }

    const meta: Meta.User = {
      role: "user",
      timestamp: msg.timestamp,
      contentOrder,
    };
    entries.push({
      filename: `${pad}-user-meta.json`,
      content: JSON.stringify(meta, null, 2),
    });

    return entries;
  },
  assistant(turnIndex: number, msg: AssistantMessage): FileEntry[] {
    const pad = padTurnIndex(turnIndex);
    const model = sanitizeForFilename(msg.model);
    const prefix = `${pad}-assistant-${model}`;

    const entries: FileEntry[] = [];
    const contentOrder: string[] = [];
    const textSignatures: Record<string, string> = {};
    const thinkingSignatures: Record<
      string,
      { signature: string; redacted: boolean }
    > = {};
    const toolCallSignatures: Record<string, string> = {};

    const texts = msg.content.filter(
      (c): c is TextContent => c.type === "text",
    );
    const thinkings = msg.content.filter(
      (c): c is ThinkingContent => c.type === "thinking",
    );
    const toolCalls = msg.content.filter(
      (c): c is ToolCall => c.type === "toolCall",
    );

    let textIdx = 0;
    let thinkingIdx = 0;
    let toolCallIdx = 0;

    for (const block of msg.content) {
      switch (block.type) {
        case "text": {
          const suffix = indexedSuffix("text", textIdx, texts.length);
          const fn = `${prefix}-${suffix}.md`;
          entries.push({ filename: fn, content: block.text });
          contentOrder.push(fn);
          if (block.textSignature) textSignatures[fn] = block.textSignature;
          textIdx++;
          break;
        }
        case "thinking": {
          const suffix = indexedSuffix(
            "thinking",
            thinkingIdx,
            thinkings.length,
          );
          const fn = `${prefix}-${suffix}.md`;
          entries.push({ filename: fn, content: block.thinking });
          contentOrder.push(fn);
          if (block.thinkingSignature || block.redacted) {
            thinkingSignatures[fn] = {
              signature: block.thinkingSignature ?? "",
              redacted: block.redacted ?? false,
            };
          }
          thinkingIdx++;
          break;
        }
        case "toolCall": {
          const suffix = indexedSuffix(
            "toolcall",
            toolCallIdx,
            toolCalls.length,
          );
          const fn = `${prefix}-${suffix}.json`;
          entries.push({
            filename: fn,
            content: JSON.stringify(
              { id: block.id, name: block.name, arguments: block.arguments },
              null,
              2,
            ),
          });
          contentOrder.push(fn);
          if (block.thoughtSignature)
            toolCallSignatures[fn] = block.thoughtSignature;
          toolCallIdx++;
          break;
        }
      }
    }

    const meta: Meta.Assistant = {
      role: "assistant",
      api: msg.api,
      provider: msg.provider,
      model: msg.model,
      ...(msg.responseId ? { responseId: msg.responseId } : {}),
      usage: msg.usage,
      stopReason: msg.stopReason,
      ...(msg.errorMessage ? { errorMessage: msg.errorMessage } : {}),
      timestamp: msg.timestamp,
      contentOrder,
      textSignatures,
      thinkingSignatures,
      toolCallSignatures,
    };

    entries.push({
      filename: `${prefix}-meta.json`,
      content: JSON.stringify(meta, null, 2),
    });

    return entries;
  },
  toolResult(turnIndex: number, msg: ToolResultMessage): FileEntry[] {
    const pad = padTurnIndex(turnIndex);
    const toolName = sanitizeForFilename(msg.toolName);
    const prefix = `${pad}-toolresult-${toolName}`;

    const entries: FileEntry[] = [];
    const contentOrder: string[] = [];

    const texts = msg.content.filter(
      (c): c is TextContent => c.type === "text",
    );
    const images = msg.content.filter(
      (c): c is ImageContent => c.type === "image",
    );

    let textIdx = 0;
    let imageIdx = 0;

    for (const block of msg.content) {
      if (block.type === "text") {
        const suffix = indexedSuffix("text", textIdx, texts.length);
        const fn = `${prefix}-${suffix}.md`;
        entries.push({ filename: fn, content: block.text });
        contentOrder.push(fn);
        textIdx++;
      } else {
        const ext = mimeToExtension(block.mimeType);
        const suffix = indexedSuffix("image", imageIdx, images.length);
        const fn = `${prefix}-${suffix}${ext}`;
        entries.push({
          filename: fn,
          content: Buffer.from(block.data, "base64"),
        });
        contentOrder.push(fn);
        imageIdx++;
      }
    }

    const meta: Meta.ToolResult = {
      role: "toolResult",
      toolCallId: msg.toolCallId,
      toolName: msg.toolName,
      isError: msg.isError,
      ...(msg.details !== undefined ? { details: msg.details } : {}),
      timestamp: msg.timestamp,
      contentOrder,
    };

    entries.push({
      filename: `${prefix}-meta.json`,
      content: JSON.stringify(meta, null, 2),
    });

    return entries;
  },
};

/**
 * Serialize a `Message` into an array of `FileEntry`s to write to disk.
 * Every message with array content also produces a `-meta.json`.
 */
export const serialize = Object.defineProperties(
  (turnIndex: number, msg: Message): FileEntry[] => {
    switch (msg.role) {
      case "user":
        return _serialize.user(turnIndex, msg);
      case "assistant":
        return _serialize.assistant(turnIndex, msg);
      case "toolResult":
        return _serialize.toolResult(turnIndex, msg);
    }
  },
  _serialize,
);

// ---------------------------------------------------------------------------
// FileEntry[] → Message deserialization (load from disk)
// ---------------------------------------------------------------------------

const _deserialize = {
  user(meta: Meta.User, files: Map<string, string | Buffer>): UserMessage {
    const blocks: (TextContent | ImageContent)[] = [];

    for (const fn of meta.contentOrder) {
      const raw = files.get(fn);
      if (!raw) continue;
      if (fn.endsWith(".md")) {
        blocks.push({ type: "text", text: raw.toString() });
      } else {
        const ext = path.extname(fn);
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        blocks.push({
          type: "image",
          data: buf.toString("base64"),
          mimeType: extensionToMime(ext),
        });
      }
    }

    return { role: "user", content: blocks, timestamp: meta.timestamp };
  },
  assistant(
    meta: Meta.Assistant,
    files: Map<string, string | Buffer>,
  ): AssistantMessage {
    const blocks: (TextContent | ThinkingContent | ToolCall)[] = [];

    for (const fn of meta.contentOrder) {
      const raw = files.get(fn);
      if (!raw) continue;
      const str = raw.toString();

      if (fn.includes("-thinking") && fn.endsWith(".md")) {
        const sig = meta.thinkingSignatures[fn];
        blocks.push({
          type: "thinking",
          thinking: str,
          ...(sig?.signature ? { thinkingSignature: sig.signature } : {}),
          ...(sig?.redacted ? { redacted: true } : {}),
        });
      } else if (fn.includes("-text") && fn.endsWith(".md")) {
        const sig = meta.textSignatures[fn];
        blocks.push({
          type: "text",
          text: str,
          ...(sig ? { textSignature: sig } : {}),
        });
      } else if (fn.includes("-toolcall") && fn.endsWith(".json")) {
        const body = JSON.parse(str);
        const sig = meta.toolCallSignatures[fn];
        blocks.push({
          type: "toolCall",
          id: body.id,
          name: body.name,
          arguments: body.arguments,
          ...(sig ? { thoughtSignature: sig } : {}),
        });
      }
    }

    return {
      role: "assistant",
      content: blocks,
      api: meta.api,
      provider: meta.provider,
      model: meta.model,
      ...(meta.responseId ? { responseId: meta.responseId } : {}),
      usage: meta.usage,
      stopReason: meta.stopReason,
      ...(meta.errorMessage ? { errorMessage: meta.errorMessage } : {}),
      timestamp: meta.timestamp,
    };
  },
  toolResult(
    meta: Meta.ToolResult,
    files: Map<string, string | Buffer>,
  ): ToolResultMessage {
    const blocks: (TextContent | ImageContent)[] = [];

    for (const fn of meta.contentOrder) {
      const raw = files.get(fn);
      if (!raw) continue;
      if (fn.endsWith(".md")) {
        blocks.push({ type: "text", text: raw.toString() });
      } else {
        const ext = path.extname(fn);
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        blocks.push({
          type: "image",
          data: buf.toString("base64"),
          mimeType: extensionToMime(ext),
        });
      }
    }

    return {
      role: "toolResult",
      toolCallId: meta.toolCallId,
      toolName: meta.toolName,
      content: blocks,
      ...(meta.details !== undefined ? { details: meta.details } : {}),
      isError: meta.isError,
      timestamp: meta.timestamp,
    };
  },
};

export const deserialize = Object.defineProperties(
  (turnFiles: Map<string, string | Buffer>) => {
    const entries = [...turnFiles.entries()];
    const metaEntry = entries.find(([f]) => f.endsWith("-meta.json"));

    // No meta → simple string user message (single .md)
    if (!metaEntry) {
      const mdEntry = entries.find(([f]) => f.endsWith(".md"));
      if (mdEntry) {
        return {
          role: "user",
          content: mdEntry[1].toString(),
          timestamp: 0, // caller can fill from file mtime if desired
        } satisfies UserMessage;
      }
      return;
    }

    const meta = JSON.parse(metaEntry[1].toString()) as Meta.Turn;

    switch (meta.role) {
      case "user":
        return _deserialize.user(meta, turnFiles);
      case "assistant":
        return _deserialize.assistant(meta, turnFiles);
      case "toolResult":
        return _deserialize.toolResult(meta, turnFiles);
    }
  },
  _deserialize,
);
