import { delimiter } from "node:path";
import { spawnSync } from "child_process";

/**
 * Find bash executable on PATH
 */
function findBash(): string | null {
  // Unix: Use 'which' and trust its output (handles Termux and special filesystems)
  try {
    const result = spawnSync("which", ["bash"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
      if (firstMatch) return firstMatch;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

let cachedShellConfig: { shell: string; args: string[] } | null = null;

/**
 * Get shell configuration based on platform.
 * Resolution order:
 * 1. User-specified shellPath in settings.json
 * 2. On Windows: Git Bash in known locations, then bash on PATH
 * 3. On Unix: /bin/bash, then bash on PATH, then fallback to sh
 */
export function getShellConfig(): { shell: string; args: string[] } {
  if (cachedShellConfig) return cachedShellConfig;
  const shell = findBash();

  if (!shell)
    throw new Error(
      "Bash shell not found. Please ensure bash is installed and on your PATH.",
    );

  cachedShellConfig = { shell, args: ["-c"] };
  return cachedShellConfig;
}

export function getShellEnv(): NodeJS.ProcessEnv {
  // none for now, need to better understand the use case in "pi-mono/packages/coding-agent"
  const binDirs: string[] = [];
  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
    "PATH";
  const currentPath = process.env[pathKey] ?? "";
  const pathEntries = currentPath.split(delimiter).filter(Boolean);
  const existingEntries = new Set(pathEntries);

  return {
    ...process.env,
    [pathKey]: [
      ...binDirs
        .filter(Boolean)
        .filter((binDir) => !existingEntries.has(binDir)),
      ...pathEntries,
    ].join(delimiter),
  };
}

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
export const sanitizeBinaryOutput = (str: string): string =>
  // Use Array.from to properly iterate over code points (not code units)
  // This handles surrogate pairs correctly and catches edge cases where
  // codePointAt() might return undefined
  Array.from(str)
    .filter((char) => {
      // Filter out characters that cause string-width to crash
      // This includes:
      // - Unicode format characters
      // - Lone surrogates (already filtered by Array.from)
      // - Control chars except \t \n \r
      // - Characters with undefined code points

      const code = char.codePointAt(0);

      // Skip if code point is undefined (edge case with invalid strings)
      if (code === undefined) return false;

      // Allow tab, newline, carriage return
      if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

      // Filter out control characters (0x00-0x1F, except 0x09, 0x0a, 0x0x0d)
      if (code <= 0x1f) return false;

      // Filter out Unicode format characters
      if (code >= 0xfff9 && code <= 0xfffb) return false;

      return true;
    })
    .join("");

/**
 * Kill a process and all its children
 */
export function killProcessTree(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Fallback to killing just the child if process group kill fails
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already dead
    }
  }
}
