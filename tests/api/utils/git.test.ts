import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, test, expectTypeOf, expect } from "vitest";
import * as git from "@release/api/utils/git.js";

const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pirker-suede-git-test-"),
  );
  tempDirs.push(dir);
  return dir;
};

const runGit = async (
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return stdout.trim();
};

const initRepo = async (): Promise<{ repoDir: string; branch: string }> => {
  const repoDir = await makeTempDir();
  await runGit(["init"], repoDir);
  await runGit(["config", "user.name", "Test User"], repoDir);
  await runGit(["config", "user.email", "test@example.com"], repoDir);

  const branch = "main";
  await runGit(["checkout", "-b", branch], repoDir);

  await fs.writeFile(path.join(repoDir, "README.md"), "initial\n", "utf-8");
  await runGit(["add", "README.md"], repoDir);
  await runGit(["commit", "-m", "initial"], repoDir);

  return { repoDir, branch };
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("git utils", () => {
  test("repoRoot", async () => {
    const { repoDir } = await initRepo();
    const nested = path.join(repoDir, "a", "b");
    await fs.mkdir(nested, { recursive: true });

    await expect(git.repoRoot(nested)).resolves.toBe(repoDir);
  });

  test("currentBranch, headCommit, branchExists", async () => {
    const { repoDir, branch } = await initRepo();

    await expect(git.currentBranch(repoDir)).resolves.toBe(branch);

    const sha = await git.headCommit(repoDir);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expectTypeOf(sha).toEqualTypeOf<string>();

    await expect(git.branchExists(branch, repoDir)).resolves.toBe(true);
    await expect(git.branchExists("does-not-exist", repoDir)).resolves.toBe(
      false,
    );
  });

  test("listWorktrees and tryFindWorktreeForBranch", async () => {
    const { repoDir, branch } = await initRepo();
    const featureWorktree = path.join(await makeTempDir(), "feature-worktree");

    await git.addWorktree(featureWorktree, "feature", {
      cwd: repoDir,
      baseBranch: branch,
    });

    const trees = await git.listWorktrees(repoDir);
    expect(trees.some((t) => t.path === repoDir && t.branch === branch)).toBe(
      true,
    );
    expect(
      trees.some((t) => t.path === featureWorktree && t.branch === "feature"),
    ).toBe(true);

    const found = await git.tryFindWorktreeForBranch("feature", repoDir);
    expect(found?.path).toBe(featureWorktree);

    await git.removeWorktree(featureWorktree, { cwd: repoDir });
    await expect(
      git.tryFindWorktreeForBranch("feature", repoDir),
    ).resolves.toBe(undefined);
  });

  test("addWorktree existing branch", async () => {
    const { repoDir } = await initRepo();
    const existingWorktree = path.join(
      await makeTempDir(),
      "existing-worktree",
    );

    await runGit(["branch", "existing"], repoDir);
    await git.addWorktree(existingWorktree, "existing", {
      cwd: repoDir,
      existingBranch: true,
    });

    await expect(git.currentBranch(existingWorktree)).resolves.toBe("existing");
    await git.removeWorktree(existingWorktree, { cwd: repoDir, force: true });
  });

  test("isDirty and commitAll", async () => {
    const { repoDir } = await initRepo();
    await expect(git.isDirty(repoDir)).resolves.toBe(false);

    await fs.writeFile(path.join(repoDir, "dirty.txt"), "dirty\n", "utf-8");
    await expect(git.isDirty(repoDir)).resolves.toBe(true);

    const commit = await git.commitAll("commit dirty", repoDir);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    await expect(git.isDirty(repoDir)).resolves.toBe(false);

    await expect(git.commitAll("nothing", repoDir)).resolves.toBeNull();
  });

  test("commitPaths stages only selected paths", async () => {
    const { repoDir } = await initRepo();
    await fs.writeFile(path.join(repoDir, "a.txt"), "a\n", "utf-8");
    await fs.writeFile(path.join(repoDir, "b.txt"), "b\n", "utf-8");

    const commit = await git.commitPaths(["a.txt"], "commit a", repoDir);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);

    const names = await runGit(
      ["show", "--name-only", "--pretty=format:"],
      repoDir,
    );
    expect(names.split("\n").includes("a.txt")).toBe(true);
    expect(names.split("\n").includes("b.txt")).toBe(false);

    await expect(git.isDirty(repoDir)).resolves.toBe(true);
  });

  test("merge", async () => {
    const { repoDir, branch } = await initRepo();

    await runGit(["checkout", "-b", "feature"], repoDir);
    await fs.writeFile(path.join(repoDir, "feature.txt"), "feature\n", "utf-8");
    await runGit(["add", "feature.txt"], repoDir);
    await runGit(["commit", "-m", "feature commit"], repoDir);

    await runGit(["checkout", branch], repoDir);

    const mergeSha = await git.merge("feature", {
      cwd: repoDir,
      noFf: true,
      message: "merge feature",
    });
    expect(mergeSha).toMatch(/^[0-9a-f]{40}$/);

    const message = await runGit(["log", "-1", "--pretty=%s"], repoDir);
    expect(message).toBe("merge feature");
  });

  test("push", async () => {
    const { repoDir } = await initRepo();
    const remoteRoot = await makeTempDir();
    const remoteDir = path.join(remoteRoot, "remote.git");

    await runGit(["init", "--bare", remoteDir], repoDir);
    await runGit(["remote", "add", "origin", remoteDir], repoDir);

    await runGit(["checkout", "-b", "push-branch"], repoDir);
    await fs.writeFile(path.join(repoDir, "push.txt"), "push\n", "utf-8");
    await runGit(["add", "push.txt"], repoDir);
    await runGit(["commit", "-m", "push commit"], repoDir);

    await expect(
      git.push("push-branch", { cwd: repoDir, remote: "origin" }),
    ).resolves.toBeUndefined();

    const refs = await runGit(
      [
        "--git-dir",
        remoteDir,
        "show-ref",
        "--verify",
        "refs/heads/push-branch",
      ],
      repoDir,
    );
    expect(refs.length).toBeGreaterThan(0);
  });

  test("ensureLfs is non-fatal", async () => {
    const { repoDir } = await initRepo();
    await expect(git.ensureLfs(repoDir)).resolves.toBeUndefined();
  });

  test("getGitCommits and findMostRecentCommitBefore", async () => {
    const { repoDir } = await initRepo();

    await fs.writeFile(path.join(repoDir, "history.txt"), "one\n", "utf-8");
    await runGit(["add", "history.txt"], repoDir);
    await runGit(["commit", "-m", "first"], repoDir, {
      GIT_AUTHOR_DATE: "1970-01-01T00:16:40Z",
      GIT_COMMITTER_DATE: "1970-01-01T00:16:40Z",
    });

    await fs.writeFile(path.join(repoDir, "history.txt"), "two\n", "utf-8");
    await runGit(["add", "history.txt"], repoDir);
    await runGit(["commit", "-m", "second"], repoDir, {
      GIT_AUTHOR_DATE: "1970-01-01T00:33:20Z",
      GIT_COMMITTER_DATE: "1970-01-01T00:33:20Z",
    });

    const commits = await git.getGitCommits(repoDir);
    expect(commits.length).toBeGreaterThanOrEqual(2);
    expect(commits[0]?.message).toBe("second");
    expect(commits[1]?.message).toBe("first");

    const beforeSecond = git.findMostRecentCommitBefore(
      commits,
      new Date("1970-01-01T00:25:00Z"),
    );
    expect(beforeSecond?.message).toBe("first");

    const beforeEverything = git.findMostRecentCommitBefore(
      commits,
      new Date("1970-01-01T00:00:01Z"),
    );
    expect(beforeEverything).toBeUndefined();
  });
});
