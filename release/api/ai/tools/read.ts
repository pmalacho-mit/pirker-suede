import type { AgentTool } from "../agent/types.js";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import { type Static, Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import { formatDimensionNote, resizeImage } from "../../utils/image/resize.js";
import { detectSupportedImageMimeTypeFromBuffer } from "../../utils/image/mime.js";
import { resolveReadPath, resolveToCwd } from "../../utils/path.js";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
} from "../../utils/truncate.js";

const readSchema = Type.Object({
  path: Type.String({
    description: "Path to the file to read (relative or absolute)",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "Line number to start reading from (1-indexed)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum number of lines to read" }),
  ),
  commit: Type.Optional(
    Type.String({
      description:
        "Git commit, tag, or ref to read from instead of the working tree",
    }),
  ),
});

export type ReadToolInput = Static<typeof readSchema>;

export interface ReadToolDetails {
  truncation?: TruncationResult;
}

export interface ReadTarget {
  absolutePath: string;
  commit?: string;
  repoRoot?: string;
  repoRelativePath?: string;
}

/**
 * Pluggable operations for the read tool.
 * Override these to delegate file reading to remote systems (e.g., SSH).
 */
export interface ReadOperations {
  /** Read file contents as a Buffer */
  readFile: (target: ReadTarget, signal?: AbortSignal) => Promise<Buffer>;
  /** Check if file is readable (throw if not) */
  access: (target: ReadTarget, signal?: AbortSignal) => Promise<void>;
  /** Detect image MIME type, return null/undefined for non-images */
  detectImageMimeType?: (
    target: ReadTarget,
    buffer: Buffer,
  ) => Promise<string | null | undefined>;
}

function runGit(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
      reject(
        new Error(
          stderr || `git ${args.join(" ")} failed with exit code ${code}`,
        ),
      );
    });
  });
}

async function getGitRepoRoot(
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  const stdout = await runGit(["rev-parse", "--show-toplevel"], cwd, signal);
  return stdout.toString("utf-8").trim();
}

async function resolveReadTarget(
  filePath: string,
  cwd: string,
  commit?: string,
  signal?: AbortSignal,
): Promise<ReadTarget> {
  if (!commit) {
    return {
      absolutePath: resolveReadPath(filePath, cwd),
    };
  }

  const repoRoot = await getGitRepoRoot(cwd, signal);
  const absolutePath = resolveToCwd(filePath, cwd);
  const repoRelativePath = relative(repoRoot, absolutePath);

  if (
    repoRelativePath.length === 0 ||
    repoRelativePath === ".." ||
    repoRelativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `Path ${filePath} is outside the git repository rooted at ${repoRoot}`,
    );
  }

  return {
    absolutePath,
    commit,
    repoRoot,
    repoRelativePath: repoRelativePath.split(sep).join("/"),
  };
}

const defaultReadOperations: ReadOperations = {
  readFile: (target, signal) => {
    if (target.commit && target.repoRoot && target.repoRelativePath) {
      return runGit(
        ["show", `${target.commit}:${target.repoRelativePath}`],
        target.repoRoot,
        signal,
      );
    }

    return fsReadFile(target.absolutePath);
  },
  access: async (target, signal) => {
    if (target.commit && target.repoRoot && target.repoRelativePath) {
      await runGit(
        ["cat-file", "-e", `${target.commit}:${target.repoRelativePath}`],
        target.repoRoot,
        signal,
      );
      return;
    }

    await fsAccess(target.absolutePath, constants.R_OK);
  },
  detectImageMimeType: (_target, buffer) =>
    detectSupportedImageMimeTypeFromBuffer(buffer),
};

export interface ReadToolOptions {
  /** Whether to auto-resize images to 2000x2000 max. Default: true */
  autoResizeImages?: boolean;
  /** Custom operations for file reading. Default: local filesystem */
  operations?: ReadOperations;
}

export function createReadTool(
  cwd: string,
  options?: ReadToolOptions,
): AgentTool<typeof readSchema> {
  const autoResizeImages = options?.autoResizeImages ?? true;
  const ops = options?.operations ?? defaultReadOperations;

  return {
    name: "read",
    label: "read",
    description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. Optionally provide commit to read a file from a specific git revision. When you need the full file, continue with offset until complete.`,
    parameters: readSchema,
    execute: async (
      _toolCallId: string,
      {
        path,
        offset,
        limit,
        commit,
      }: { path: string; offset?: number; limit?: number; commit?: string },
      signal?: AbortSignal,
    ) => {
      const target = await resolveReadTarget(path, cwd, commit, signal);

      return new Promise<{
        content: (TextContent | ImageContent)[];
        details: ReadToolDetails | undefined;
      }>((resolve, reject) => {
        // Check if already aborted
        if (signal?.aborted) {
          reject(new Error("Operation aborted"));
          return;
        }

        let aborted = false;

        // Set up abort handler
        const onAbort = () => {
          aborted = true;
          reject(new Error("Operation aborted"));
        };

        if (signal) {
          signal.addEventListener("abort", onAbort, { once: true });
        }

        // Perform the read operation
        (async () => {
          try {
            // Check if file exists
            await ops.access(target, signal);

            // Check if aborted before reading
            if (aborted) {
              return;
            }

            const buffer = await ops.readFile(target, signal);

            if (aborted) {
              return;
            }

            const mimeType = ops.detectImageMimeType
              ? await ops.detectImageMimeType(target, buffer)
              : undefined;

            // Read the file based on type
            let content: (TextContent | ImageContent)[];
            let details: ReadToolDetails | undefined;

            if (mimeType) {
              // Read as image (binary)
              const base64 = buffer.toString("base64");

              if (autoResizeImages) {
                // Resize image if needed
                const resized = await resizeImage({
                  type: "image",
                  data: base64,
                  mimeType,
                });
                const dimensionNote = formatDimensionNote(resized);

                let textNote = `Read image file [${resized.mimeType}]`;
                if (dimensionNote) {
                  textNote += `\n${dimensionNote}`;
                }

                content = [
                  { type: "text", text: textNote },
                  {
                    type: "image",
                    data: resized.data,
                    mimeType: resized.mimeType,
                  },
                ];
              } else {
                const textNote = `Read image file [${mimeType}]`;
                content = [
                  { type: "text", text: textNote },
                  { type: "image", data: base64, mimeType },
                ];
              }
            } else {
              // Read as text
              const textContent = buffer.toString("utf-8");
              const allLines = textContent.split("\n");
              const totalFileLines = allLines.length;

              // Apply offset if specified (1-indexed to 0-indexed)
              const startLine = offset ? Math.max(0, offset - 1) : 0;
              const startLineDisplay = startLine + 1; // For display (1-indexed)

              // Check if offset is out of bounds
              if (startLine >= allLines.length) {
                throw new Error(
                  `Offset ${offset} is beyond end of file (${allLines.length} lines total)`,
                );
              }

              // If limit is specified by user, use it; otherwise we'll let truncateHead decide
              let selectedContent: string;
              let userLimitedLines: number | undefined;
              if (limit !== undefined) {
                const endLine = Math.min(startLine + limit, allLines.length);
                selectedContent = allLines.slice(startLine, endLine).join("\n");
                userLimitedLines = endLine - startLine;
              } else {
                selectedContent = allLines.slice(startLine).join("\n");
              }

              // Apply truncation (respects both line and byte limits)
              const truncation = truncateHead(selectedContent);

              let outputText: string;

              if (truncation.firstLineExceedsLimit) {
                // First line at offset exceeds 30KB - tell model to use bash
                const firstLineSize = formatSize(
                  Buffer.byteLength(allLines[startLine], "utf-8"),
                );
                outputText = commit
                  ? `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: git show '${commit}:${target.repoRelativePath}' | sed -n '${startLineDisplay}p' | head -c ${DEFAULT_MAX_BYTES}]`
                  : `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
                details = { truncation };
              } else if (truncation.truncated) {
                // Truncation occurred - build actionable notice
                const endLineDisplay =
                  startLineDisplay + truncation.outputLines - 1;
                const nextOffset = endLineDisplay + 1;

                outputText = truncation.content;

                if (truncation.truncatedBy === "lines") {
                  outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
                } else {
                  outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
                }
                details = { truncation };
              } else if (
                userLimitedLines !== undefined &&
                startLine + userLimitedLines < allLines.length
              ) {
                // User specified limit, there's more content, but no truncation
                const remaining =
                  allLines.length - (startLine + userLimitedLines);
                const nextOffset = startLine + userLimitedLines + 1;

                outputText = truncation.content;
                outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
              } else {
                // No truncation, no user limit exceeded
                outputText = truncation.content;
              }

              content = [{ type: "text", text: outputText }];
            }

            // Check if aborted after reading
            if (aborted) {
              return;
            }

            // Clean up abort handler
            if (signal) {
              signal.removeEventListener("abort", onAbort);
            }

            resolve({ content, details });
          } catch (error: any) {
            // Clean up abort handler
            if (signal) {
              signal.removeEventListener("abort", onAbort);
            }

            if (!aborted) {
              reject(error);
            }
          }
        })();
      });
    },
  };
}
