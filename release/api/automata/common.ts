import * as path from "node:path";
import * as fs from "node:fs/promises";

const CONSTANTS = {
  WORKTREE_DIR: ".worktrees",
};

/**
 * Derive the worktree directory path from a branch name.
 * Slashes in branch names (e.g. `feature/foo`) become `--` so we avoid
 * nested directories that could collide with other branches.
 */
export const worktreePath = (repoRoot: string, branch: string): string =>
  path.join(repoRoot, CONSTANTS.WORKTREE_DIR, branch.replace(/\//g, "--"));

export const ensureWorktreeContainer = async (repoRoot: string) =>
  await fs.mkdir(path.join(repoRoot, CONSTANTS.WORKTREE_DIR), {
    recursive: true,
  });
