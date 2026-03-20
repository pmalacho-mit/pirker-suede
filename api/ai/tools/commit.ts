import { spawn } from "node:child_process";
import { relative, sep } from "node:path";
import type { AgentTool } from "../agent/types.js";
import { type Static, Type } from "@sinclair/typebox";
import { resolveToCwd } from "../../utils/path.js";

const commitSchema = Type.Object({
  message: Type.String({
    description: "Commit message to use for the new git commit",
  }),
  files: Type.Array(
    Type.String({
      description: "Path to a file to stage and commit (relative or absolute)",
    }),
    {
      minItems: 1,
      description: "Files to stage and include in the commit",
    },
  ),
});

export type CommitToolInput = Static<typeof commitSchema>;

export interface CommitToolDetails {
  remainingStaged: string[];
  remainingUnstaged: string[];
  remainingUntracked: string[];
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface CommitOperations {
  exec: (
    args: string[],
    cwd: string,
    signal?: AbortSignal,
  ) => Promise<GitCommandResult>;
}

function execGit(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<GitCommandResult> {
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

    child.on("close", (exitCode) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode,
      });
    });
  });
}

const defaultCommitOperations: CommitOperations = {
  exec: execGit,
};

export interface CommitToolOptions {
  operations?: CommitOperations;
}

async function getRepoRoot(
  cwd: string,
  ops: CommitOperations,
  signal?: AbortSignal,
): Promise<string> {
  const result = await ops.exec(["rev-parse", "--show-toplevel"], cwd, signal);
  if (result.exitCode !== 0) {
    const errorOutput = [result.stderr.trim(), result.stdout.trim()]
      .filter(Boolean)
      .join("\n");
    throw new Error(errorOutput || "Not inside a git repository");
  }

  return result.stdout.trim();
}

function toRepoRelativePath(
  filePath: string,
  cwd: string,
  repoRoot: string,
): string {
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

  return repoRelativePath.split(sep).join("/");
}

function formatGitFailure(step: string, result: GitCommandResult): Error {
  const output = [result.stdout.trim(), result.stderr.trim()]
    .filter(Boolean)
    .join("\n");
  return new Error(
    output || `git ${step} failed with exit code ${result.exitCode}`,
  );
}

function summarizeRemainingChanges(statusOutput: string): CommitToolDetails {
  const remainingStaged: string[] = [];
  const remainingUnstaged: string[] = [];
  const remainingUntracked: string[] = [];

  for (const line of statusOutput.split("\n")) {
    if (!line.trim() || line.length < 3) {
      continue;
    }

    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const filePath = line.slice(3).trim();

    if (indexStatus === "?" && workTreeStatus === "?") {
      remainingUntracked.push(filePath);
      continue;
    }

    if (indexStatus !== " ") {
      remainingStaged.push(filePath);
    }

    if (workTreeStatus !== " ") {
      remainingUnstaged.push(filePath);
    }
  }

  return {
    remainingStaged,
    remainingUnstaged,
    remainingUntracked,
  };
}

function buildRemainingChangesNotice(details: CommitToolDetails): string {
  const lines: string[] = [];

  if (details.remainingStaged.length > 0) {
    lines.push("Remaining staged changes not included in this commit:");
    lines.push(...details.remainingStaged.map((filePath) => `  ${filePath}`));
  }

  if (details.remainingUnstaged.length > 0) {
    lines.push("Remaining unstaged changes not included in this commit:");
    lines.push(...details.remainingUnstaged.map((filePath) => `  ${filePath}`));
  }

  if (details.remainingUntracked.length > 0) {
    lines.push("Remaining untracked files not included in this commit:");
    lines.push(
      ...details.remainingUntracked.map((filePath) => `  ${filePath}`),
    );
  }

  if (lines.length === 0) {
    return "";
  }

  return [
    "WARNING: The repository still has changes after this commit.",
    ...lines,
  ].join("\n");
}

export function createCommitTool(
  cwd: string,
  options?: CommitToolOptions,
): AgentTool<typeof commitSchema> {
  const ops = options?.operations ?? defaultCommitOperations;

  return {
    name: "commit",
    label: "commit",
    description:
      "Stage the specified files and create a git commit with the provided message. Returns git's commit output and highlights any remaining changes that were not included.",
    parameters: commitSchema,
    execute: async (
      _toolCallId: string,
      { message, files }: { message: string; files: string[] },
      signal?: AbortSignal,
    ) => {
      const repoRoot = await getRepoRoot(cwd, ops, signal);
      const repoRelativePaths = files.map((filePath) =>
        toRepoRelativePath(filePath, cwd, repoRoot),
      );

      const addResult = await ops.exec(
        ["add", "--", ...repoRelativePaths],
        repoRoot,
        signal,
      );
      if (addResult.exitCode !== 0) {
        throw formatGitFailure("add", addResult);
      }

      const commitResult = await ops.exec(
        ["commit", "-m", message, "--only", "--", ...repoRelativePaths],
        repoRoot,
        signal,
      );
      if (commitResult.exitCode !== 0) {
        throw formatGitFailure("commit", commitResult);
      }

      const statusResult = await ops.exec(
        ["status", "--short", "--untracked-files=all"],
        repoRoot,
        signal,
      );
      if (statusResult.exitCode !== 0) {
        throw formatGitFailure("status", statusResult);
      }

      const details = summarizeRemainingChanges(statusResult.stdout);
      const remainingNotice = buildRemainingChangesNotice(details);
      const gitOutput = [commitResult.stdout.trim(), commitResult.stderr.trim()]
        .filter(Boolean)
        .join("\n");
      const text = remainingNotice
        ? [gitOutput, "", remainingNotice].filter(Boolean).join("\n")
        : gitOutput;

      return {
        content: [{ type: "text", text }],
        details,
      };
    },
  };
}
