import { execSync } from "node:child_process";

interface Commit {
  hash: string;
  timestamp: number;
  date: string;
  message: string;
}

export const getGitCommits = (repoPath: string) =>
  execSync(`git -C "${repoPath}" log --format="%H %ct %s"`, {
    encoding: "utf-8",
  })
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

export const findMostRecentCommitBefore = (commits: Commit[], date: Date) => {
  const targetTimestamp = date.getTime() / 1000;
  return commits.find((c) => c.timestamp < targetTimestamp);
};
