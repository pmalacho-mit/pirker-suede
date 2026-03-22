import * as path from "node:path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * NOTE: Uses the directory of the zip file as the working directory when adding entries,
 * so `entryName` should be a relative path from that directory.
 * @param zipPath
 * @param entryName
 * @returns A promise that resolves when the file has been added to the zip archive.
 */
export const addFileToArchive = async (zipPath: string, entryName: string) =>
  execFileAsync("zip", [zipPath, entryName], {
    cwd: path.dirname(zipPath),
  });

export const extractArchive = async (zipPath: string, extractToDir?: string) =>
  execFileAsync("unzip", [
    zipPath,
    "-d",
    extractToDir ?? path.dirname(zipPath),
  ]);
