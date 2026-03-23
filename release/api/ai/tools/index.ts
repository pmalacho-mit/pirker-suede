export {
  type BashOperations,
  type BashSpawnContext,
  type BashSpawnHook,
  type BashToolDetails,
  type BashToolInput,
  type BashToolOptions,
  createBashTool,
  createLocalBashOperations,
} from "./bash.js";
export {
  createCommitTool,
  type CommitOperations,
  type CommitToolDetails,
  type CommitToolInput,
  type CommitToolOptions,
} from "./commit.js";
export {
  createEditTool,
  type EditOperations,
  type EditToolDetails,
  type EditToolInput,
  type EditToolOptions,
} from "./edit/";
export {
  createFindTool,
  type FindOperations,
  type FindToolDetails,
  type FindToolInput,
  type FindToolOptions,
} from "./find.js";
export {
  createGrepTool,
  type GrepOperations,
  type GrepToolDetails,
  type GrepToolInput,
  type GrepToolOptions,
} from "./grep.js";
export {
  createLsTool,
  type LsOperations,
  type LsToolDetails,
  type LsToolInput,
  type LsToolOptions,
} from "./ls.js";
export {
  createReadTool,
  type ReadOperations,
  type ReadToolDetails,
  type ReadToolInput,
  type ReadToolOptions,
} from "./read.js";
export {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationOptions,
  type TruncationResult,
  truncateHead,
  truncateLine,
  truncateTail,
} from "../../utils/truncate.js";
export {
  createWriteTool,
  type WriteOperations,
  type WriteToolInput,
  type WriteToolOptions,
} from "./write.js";
export {
  createBrowserTool,
  type BrowserToolInput,
  type BrowserToolOptions,
} from "./browser.js";

import type { AgentTool } from "../agent/types.js";
import { type BashToolOptions, createBashTool } from "./bash.js";
import { createCommitTool } from "./commit.js";
import { createEditTool } from "./edit/";
import { createFindTool } from "./find.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { createReadTool, type ReadToolOptions } from "./read.js";
import { createWriteTool } from "./write.js";
import { createBrowserTool, type BrowserToolOptions } from "./browser.js";

/** Tool type (AgentTool from pi-ai) */
export type Tool = AgentTool<any>;

export interface ToolsOptions {
  /** Options for the read tool */
  read?: ReadToolOptions;
  /** Options for the bash tool */
  bash?: BashToolOptions;
  /** Options for the browser tool */
  browser?: BrowserToolOptions;
}

/**
 * Create coding tools configured for a specific working directory.
 */
export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
  return [
    createReadTool(cwd, options?.read),
    createBashTool(cwd, options?.bash),
    createBrowserTool(cwd, options?.browser),
    createEditTool(cwd),
    createWriteTool(cwd),
    createCommitTool(cwd),
  ];
}

/**
 * Create read-only tools configured for a specific working directory.
 */
export function createReadOnlyTools(
  cwd: string,
  options?: ToolsOptions,
): Tool[] {
  return [
    createReadTool(cwd, options?.read),
    createGrepTool(cwd),
    createFindTool(cwd),
    createLsTool(cwd),
  ];
}

/**
 * Create all tools configured for a specific working directory.
 */
export const createAllTools = (cwd: string, options?: ToolsOptions) => ({
  read: createReadTool(cwd, options?.read),
  bash: createBashTool(cwd, options?.bash),
  browser: createBrowserTool(cwd, options?.browser),
  edit: createEditTool(cwd),
  write: createWriteTool(cwd),
  commit: createCommitTool(cwd),
  grep: createGrepTool(cwd),
  find: createFindTool(cwd),
  ls: createLsTool(cwd),
});

export type ToolName = keyof ReturnType<typeof createAllTools>;
