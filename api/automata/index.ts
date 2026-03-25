/**
 * release/api/automata/index.ts
 *
 * An automaton is a coding agent bound to a git branch. It operates within a
 * worktree of that branch and persists its conversation history to a session
 * within the worktree's `.sessions` directory.
 *
 */

import type { Message, Model, Api, Tool } from "@mariozechner/pi-ai";
import * as git from "../utils/git";
import {
  type Session,
  createSession,
  loadSession,
  addMessage as sessionAddMessage,
  getSessionHistory,
  copySession,
  compactSession,
  listSessions,
} from "../sessions";
import { ensureWorktreeContainer, worktreePath } from "./common";
import { WithEvents } from "../../suede/with-events-suede";
import type { AgentEvent, AgentMessage, AgentTool } from "../ai/agent/types";
import { agentLoop, type LoopPayload } from "../ai/agent/loop";
import type { ResolvedStream } from "../ai/models";

export namespace Automata {
  export interface Handle {
    /** The git branch this automaton operates on. */
    readonly branch: string;

    /**
     * Absolute path to the worktree root (something like `<repo>/.worktrees/<branch>`). This is where:
     *  - The automaton performs all file operations
     *  - `.sessions/` lives
     */
    readonly root: string;

    /** The model used for LLM calls (included in assistant message filenames). */
    model: Model<Api>;

    /** The active session. `null` until one is created / loaded. */
    session: Session.Handle | null;

    /**
     * Tools available to the agent.
     * ← EXTERNAL: provided by the caller's tool registry.
     */
    tools: Tool[];
  }

  export interface CreateOpts {
    /**
     * Absolute path to the repository root (the main checkout).
     * Worktrees will be created at `<repoRoot>/.worktrees/<branch>`.
     */
    repoRoot: string;

    /** Branch name for this automaton. */
    branch: string;

    /**
     * Base branch/commit to create the new branch from.
     * Only used when the branch does NOT already exist.
     * Falls back to git's default (current HEAD) if omitted.
     */
    baseBranch?: string;

    /**
     * Must be set to `true` when the branch already exists.
     * `create()` returns `{ status: "branch_exists" }` to give the caller
     * a chance to prompt "Are you sure?" before retrying with this flag.
     */
    confirmed?: boolean;
  }

  export type CreateResult =
    | { status: "created"; automaton: Automaton }
    | { status: "branch_exists"; branch: string };

  export type SessionChoice =
    | { type: "fresh"; systemPrompt?: string }
    | { type: "resume"; sessionId: string }
    | { type: "copy"; sourceSessionId: string }
    | {
        type: "compact";
        sourceSessionId: string;
        /**
         * ← EXTERNAL: caller-provided function that takes the full message
         * history and returns a condensed version for the new session.
         */
        compact: (messages: Message[]) => Promise<Message[]>;
      };

  export type FinishStrategy =
    | { type: "pr" }
    | { type: "merge"; targetCwd: string; noFf?: boolean }
    | { type: "dispose" };

  export interface FinishResult {
    /** The commit SHA after committing session data + any file changes. */
    commitSha: string | null;
    /** The branch name (handy for PR creation). */
    branch: string;
    /** Whether the worktree was removed. */
    disposed: boolean;
    /** SHA of merge commit (only for `merge` strategy). */
    mergeSha?: string;
  }
}

const readyToStart = (payload: Partial<LoopPayload>): payload is LoopPayload =>
  payload.config?.stream !== undefined &&
  payload.context !== undefined &&
  payload.signal !== undefined;

/**
 * An automaton is a coding agent bound to a git branch. It operates within a
 * worktree of that branch and persists its conversation history to a session
 * within the worktree's `.sessions` directory.
 */
class Automaton extends WithEvents<{
  [k in AgentEvent["type"]]: [AgentEvent & { type: k }];
}> {
  /** The git branch this automaton operates on. */
  readonly branch: string;

  /**
   * Absolute path to the worktree root (something like `<repo>/.worktrees/<branch>`). This is where:
   *  - The automaton performs all file operations
   *  - `.sessions/` lives
   */
  readonly root: string;

  private readonly loopPayload: Partial<LoopPayload> &
    Pick<LoopPayload, "context">;

  /** The active session. `null` until one is created / loaded. */
  private session?: Session.Handle;

  private abortController?: AbortController;

  /**
   * List all sessions that exist in this automaton's worktree.
   */
  get sessions() {
    return listSessions(this.root);
  }

  set stream(stream: ResolvedStream) {
    if (this.loopPayload.config) this.loopPayload.config.stream = stream;
    else this.loopPayload.config = { stream };
  }

  constructor({ branch, root }: Pick<Automaton, "branch" | "root">) {
    super();
    this.branch = branch;
    this.root = root;
    this.loopPayload = {
      context: {
        systemPrompt: "", // set during initialization
        messages: [],
        tools: [],
      },
    };
  }

  setTools(request: "add" | "remove", ...tools: AgentTool[]): void;
  setTools(request: "clear"): void;
  setTools(request: "add" | "remove" | "clear", ...tools: AgentTool[]): void {
    const { context } = this.loopPayload;
    context.tools ??= [];
    switch (request) {
      case "add":
        for (const tool of tools)
          if (!context.tools.includes(tool)) context.tools.push(tool);
        break;
      case "remove":
        for (const tool of tools) {
          const index = context.tools.indexOf(tool);
          if (index !== -1) context.tools.splice(index, 1);
        }
        break;
      case "clear":
        context.tools.length = 0;
        break;
    }
  }

  async initialize(
    stream: ResolvedStream,
    tools: AgentTool[],
    choice: Automata.SessionChoice,
    abortController?: AbortController,
  ) {
    const { root: branchRoot, branch } = this;
    const commitAtCreation = await git.headCommit(branchRoot);

    let session: Session.Handle;

    switch (choice.type) {
      case "fresh": {
        const { systemPrompt } = choice;
        session = await createSession({
          branchRoot,
          branch,
          commitAtCreation,
          systemPrompt,
        });
        break;
      }
      case "resume": {
        session = await loadSession(branchRoot, choice.sessionId);
        break;
      }
      case "copy": {
        const source = await loadSession(branchRoot, choice.sourceSessionId);
        session = await copySession({ source, branch, commitAtCreation });
        break;
      }
      case "compact": {
        const source = await loadSession(branchRoot, choice.sourceSessionId);
        session = await compactSession(
          { source, branch, commitAtCreation },
          choice.compact,
        );
        break;
      }
    }

    this.stream = stream;
    this.setTools("add", ...tools);
    this.session = session;
    for (const msg of await getSessionHistory(session))
      this.loopPayload.context.messages.push(msg);
    this.loopPayload.context.systemPrompt = session.systemPrompt ?? "";
    this.abortController = abortController ?? new AbortController();
    this.loopPayload.signal = this.abortController.signal;
    return session;
  }

  start(prompts?: AgentMessage[]) {
    if (!this.session) throw new Error("Automaton not initialized.");
    if (!readyToStart(this.loopPayload))
      throw new Error(
        `Automaton not ready to start. Missing config, context, or signal. ${JSON.stringify(
          this.loopPayload,
        )}`,
      );
    if (prompts) this.loopPayload.context.messages.push(...prompts);
    const eventStream = agentLoop(this.loopPayload);
    this.handleEventStream(eventStream);
    return eventStream;
  }

  /**
   * Finish an automaton's work.
   *
   * Always:
   *  1. Commits any uncommitted changes in the worktree.
   *  2. Pushes the branch to the remote.
   *
   * Then, depending on the strategy:
   *
   *  - **`pr`**: TODO use github cli
   *
   *  - **`merge`**: Merges the automaton's branch into whatever branch is
   *    checked out at `targetCwd` (typically a parent automaton's worktree
   *    or the main checkout).
   *
   *  - **`dispose`**: Removes the worktree. The branch is still pushed, so
   *    session data is preserved in the remote.
   */
  async finish(
    strategy: Automata.FinishStrategy,
    opts?: { remote?: string },
  ): Promise<Automata.FinishResult> {
    const commitSha = await git.commitAll(
      "chore: update session data",
      this.root,
    );

    await git.push(this.branch, {
      cwd: this.root,
      remote: opts?.remote,
    });

    const result: Automata.FinishResult = {
      commitSha,
      branch: this.branch,
      disposed: false,
    };

    // 3. Execute strategy
    switch (strategy.type) {
      case "pr": {
        // Nothing further — the caller creates the PR using the returned
        // branch name + their platform's API.
        break;
      }

      case "merge": {
        const mergeSha = await git.merge(this.branch, {
          cwd: strategy.targetCwd,
          noFf: strategy.noFf,
          message: `Merge automaton branch '${this.branch}'`,
        });
        result.mergeSha = mergeSha;
        const root = await git.repoRoot(this.root);
        await git.removeWorktree(this.root, { cwd: root });
        break;
      }

      case "dispose": {
        // Find repo root from the worktree (needed for worktree remove)
        const root = await git.repoRoot(this.root);
        await git.removeWorktree(this.root, { cwd: root });
        result.disposed = true;
        break;
      }
    }

    return result;
  }

  private async handleEventStream(eventStream: ReturnType<typeof agentLoop>) {
    if (!this.session) throw new Error("Automaton not initialized.");

    for await (const event of eventStream) {
      if (event.type === "message_end") {
        // Persist every finalized message to the session on disk.
        // This covers:
        //  - Assistant messages (from streamAssistantResponse)
        //  - Tool result messages (from executeToolCalls)
        //  - Steering / follow-up user messages (injected mid-loop)
        //
        // The initial user message is NOT re-emitted here — it was
        // already persisted by addUserMessage() before the loop started.
        //
        // We also push to context.messages since the loop operates on
        // a copy and does not mutate the original array.
        await sessionAddMessage(this.session, event.message);
        this.loopPayload.context.messages.push(event.message);
      } else if (event.type === "turn_end") this.session.nextTurnIndex += 1;

      this.fire(event.type, event as any);
    }
  }

  /**
   * Try create a new automaton bound to a git branch.
   *
   * If the branch already exists and `confirmed` is not set, returns
   * `{ status: "branch_exists" }` so the caller can prompt the user.
   *
   * On success:
   *  1. Ensures `.worktrees/` directory exists.
   *  2. Creates the worktree (and branch if new).
   *  3. Initializes git-lfs in the worktree.
   *  4. Returns a handle ready for session creation.
   */
  static async TryCreate({
    repoRoot,
    branch,
    baseBranch,
    confirmed,
  }: Automata.CreateOpts): Promise<Automata.CreateResult> {
    const exists = await git.branchExists(branch, repoRoot);

    if (exists && !confirmed) return { status: "branch_exists", branch };

    // Check if a worktree is already checked out for this branch
    const existingWt = await git.tryFindWorktreeForBranch(branch, repoRoot);

    if (existingWt)
      // Worktree already exists — reuse it
      return {
        status: "created",
        automaton: new Automaton({ branch, root: existingWt.path }),
      };

    await ensureWorktreeContainer(repoRoot);
    const root = worktreePath(repoRoot, branch);

    // Create the worktree
    await git.addWorktree(root, branch, {
      cwd: repoRoot,
      existingBranch: exists,
      baseBranch: exists ? undefined : baseBranch,
    });

    // Ensure git-lfs is ready in the worktree
    await git.ensureLfs(root);

    return {
      status: "created",
      automaton: new Automaton({ branch, root }),
    };
  }

  /**
   * Rehydrate a handle for an existing automaton from its branch name.
   * The worktree must already exist on disk.
   */
  static async Load(repoRoot: string, branch: string): Promise<Automaton> {
    const wt = await git.tryFindWorktreeForBranch(branch, repoRoot);
    if (!wt)
      throw new Error(
        `No worktree found for branch "${branch}". ` +
          `Create the automaton first with Automata.create().`,
      );

    return new Automaton({ branch, root: wt.path });
  }
}

export { Automaton };
