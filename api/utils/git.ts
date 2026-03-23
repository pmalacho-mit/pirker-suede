import { execFileAsync } from "./exec.js";

/**
 * Return the absolute path to the top-level directory of the repository
 * that contains `cwd`.
 */
export async function repoRoot(cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd },
  );
  return stdout.trim();
}

/** Return the current branch name, or `null` if HEAD is detached. */
export async function currentBranch(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["symbolic-ref", "--short", "HEAD"],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return null; // detached HEAD
  }
}

/** Return the full SHA of HEAD. */
export async function headCommit(cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

/**
 * Check whether a local branch exists.
 */
export async function branchExists(
  branch: string,
  cwd?: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      { cwd },
    );
    return true;
  } catch {
    return false;
  }
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
}

/** Parse `git worktree list --porcelain` into structured entries. */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["worktree", "list", "--porcelain"],
    { cwd },
  );

  const entries: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length);
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      // "branch refs/heads/foo" → "foo"
      current.branch = line
        .slice("branch ".length)
        .replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.branch = null;
    } else if (line === "") {
      if (current.path && current.head !== undefined) {
        entries.push({
          path: current.path,
          head: current.head,
          branch: current.branch ?? null,
        });
      }
      current = {};
    }
  }
  // Handle last entry if file doesn't end with blank line
  if (current.path && current.head !== undefined) {
    entries.push({
      path: current.path,
      head: current.head,
      branch: current.branch ?? null,
    });
  }

  return entries;
}

/** Try find the worktree that has `branch` checked out */
export const tryFindWorktreeForBranch = async (branch: string, cwd?: string) =>
  (await listWorktrees(cwd)).find((t) => t.branch === branch);

export interface AddWorktreeOpts {
  /** If true and the branch already exists, check it out instead of creating. */
  existingBranch?: boolean;
  /** Base branch/commit to create the new branch from (only when creating). */
  baseBranch?: string;
  cwd?: string;
}

/**
 * Create a worktree.
 *
 * - New branch:      `git worktree add <path> -b <branch> [baseBranch]`
 * - Existing branch: `git worktree add <path> <branch>`
 */
export async function addWorktree(
  worktreePath: string,
  branch: string,
  opts?: AddWorktreeOpts,
): Promise<void> {
  const args = ["worktree", "add"];

  if (opts?.existingBranch) args.push(worktreePath, branch);
  else {
    args.push(worktreePath, "-b", branch);
    if (opts?.baseBranch) args.push(opts.baseBranch);
  }

  await execFileAsync("git", args, { cwd: opts?.cwd });
}

/**
 * Remove a worktree and prune its administrative data.
 */
export async function removeWorktree(
  worktreePath: string,
  opts?: { force?: boolean; cwd?: string },
): Promise<void> {
  const args = ["worktree", "remove", worktreePath];
  if (opts?.force) args.push("--force");
  await execFileAsync("git", args, { cwd: opts?.cwd });
}

/**
 * Stage all changes and commit. Returns the new commit SHA, or `null` if
 * there was nothing to commit.
 */
export async function commitAll(
  message: string,
  cwd?: string,
): Promise<string | null> {
  await execFileAsync("git", ["add", "-A"], { cwd });

  try {
    await execFileAsync("git", ["commit", "-m", message], { cwd });
  } catch (err: any) {
    // "nothing to commit" exits 1 — that's fine, not an error
    if (err.stdout?.includes("nothing to commit")) return null;
    throw err;
  }

  return headCommit(cwd);
}

/**
 * Stage specific paths and commit. Returns new commit SHA, or `null` if
 * there was nothing to commit.
 */
export async function commitPaths(
  paths: string[],
  message: string,
  cwd?: string,
): Promise<string | null> {
  await execFileAsync("git", ["add", "--", ...paths], { cwd });

  try {
    await execFileAsync("git", ["commit", "-m", message], { cwd });
  } catch (err: any) {
    if (err.stdout?.includes("nothing to commit")) return null;
    throw err;
  }

  return headCommit(cwd);
}

/**
 * Push a branch to a remote. Defaults to `origin`.
 */
export async function push(
  branch: string,
  opts?: { cwd?: string; remote?: string; force?: boolean },
): Promise<void> {
  const remote = opts?.remote ?? "origin";
  const args = ["push", remote, branch];
  if (opts?.force) args.push("--force");
  await execFileAsync("git", args, { cwd: opts?.cwd });
}

/**
 * Merge `sourceBranch` into the currently checked-out branch at `cwd`.
 *
 * @returns The merge commit SHA on success, or throws on conflict.
 */
export async function merge(
  sourceBranch: string,
  opts?: { cwd?: string; noFf?: boolean; message?: string },
): Promise<string> {
  const args = ["merge"];
  if (opts?.noFf) args.push("--no-ff");
  if (opts?.message) args.push("-m", opts.message);
  args.push(sourceBranch);
  await execFileAsync("git", args, { cwd: opts?.cwd });
  return headCommit(opts?.cwd);
}

/**
 * Check if there are uncommitted changes (staged or unstaged).
 */
export async function isDirty(cwd?: string): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
    cwd,
  });
  return stdout.trim().length > 0;
}

/**
 * Ensure git-lfs is installed and initialized in the repo.
 * Non-fatal — the design doc assumes LFS is initialized by an earlier step,
 * so this is a best-effort safety net.
 */
export async function ensureLfs(cwd?: string): Promise<void> {
  try {
    await execFileAsync("git", ["lfs", "install", "--local"], { cwd });
  } catch {
    // LFS not available or already initialized — not a hard error.
    // The caller's setup step is responsible for ensuring LFS works.
  }
}

interface Commit {
  hash: string;
  timestamp: number;
  date: string;
  message: string;
}

export const getGitCommits = async (repoPath: string) => {
  const { stdout } = await execFileAsync("git", [
    "-C",
    repoPath,
    "log",
    "--format=%H %ct %s",
  ]);

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // hash is 40 chars, then a space, then the unix timestamp, then a space, then the message
      const hash = line.slice(0, 40);
      const rest = line.slice(41);
      const spaceIdx = rest.indexOf(" ");
      const timestamp = parseInt(rest.slice(0, spaceIdx), 10);
      const message = rest.slice(spaceIdx + 1);

      return {
        hash,
        timestamp,
        date: new Date(timestamp * 1000).toISOString(),
        message,
      } satisfies Commit;
    });
};

export const findMostRecentCommitBefore = (commits: Commit[], date: Date) => {
  const targetTimestamp = date.getTime() / 1000;
  return commits.find((c) => c.timestamp < targetTimestamp);
};
