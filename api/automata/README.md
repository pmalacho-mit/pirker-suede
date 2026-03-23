## Automata

An automaton is a coding agent bound to a git branch. It operates within a **worktree** of that branch, meaning all file operations and session data are scoped to that branch's working tree. Automata are the unit of work in the system — each one owns a branch, a session, a model configuration, and a set of tools.

### Relationship to git

Automata are directly tied to the git branch they are created for. The branch is checked out as a **worktree** within the repository at `.worktrees/<branch-name>` (with `/` in branch names replaced by `--` to avoid nested directories, e.g. `agent/fix-login` → `.worktrees/agent--fix-login`). The automaton operates entirely within that worktree:

- All file operations happen inside the worktree directory.
- The `.sessions/` directory lives at the worktree root.
- Commits are made against the worktree's branch.

### Branch creation

When creating an automaton, a branch must be specified. There are two workflows depending on whether the branch already exists:

**Branch does NOT exist:**
A new branch is created and checked out as a worktree. An optional `baseBranch` can be specified (equivalent to the last parameter of `git worktree add`); if omitted, git's default behavior applies (branch from current HEAD).

**Branch DOES exist:**
The `TryCreate` static method returns `{ status: "branch_exists", branch }` without creating anything. This gives the caller a chance to prompt the user with an "Are you sure?" confirmation. To proceed, the caller retries with `confirmed: true`, at which point the existing branch is checked out as a worktree (or the existing worktree is reused if one is already active).

If a worktree for the branch already exists on disk (from a prior session or a different process), it is reused rather than creating a duplicate.

Git-LFS is initialized in the worktree after creation (best-effort, non-fatal — the design assumes LFS was set up by an earlier bootstrap step).

### Automaton lifecycle

```
TryCreate / Load
      │
      ▼
  initialize(stream, tools, sessionChoice)
      │
      ▼
  addUserMessage(message)  ←──────────────────┐
      │                                        │
      ▼                                        │
  start() → agentLoop → handleEventStream      │
      │         │              │                │
      │     turn_end      message_end           │
      │         │              │                │
      │         ▼              ▼                │
      │   (advance turn)  (persist to session   │
      │                    + sync context)      │
      │                                        │
      ▼                                        │
  agent_end ──── user sends follow-up? ────────┘
      │
      ▼
  finish(strategy)
      │
      ▼
  commit + push + (pr | merge | dispose)
```

### The `Automaton` class

The automaton is implemented as a class extending `WithEvents`, allowing callers to subscribe to specific `AgentEvent` types. It is constructed via the static methods `TryCreate` or `Load` — the constructor is not called directly.

#### Static properties (set at creation, immutable)

| Property | Description                                                                         |
| -------- | ----------------------------------------------------------------------------------- |
| `branch` | The git branch the automaton is tied to                                             |
| `root`   | Absolute path to the worktree directory (e.g. `<repo>/.worktrees/agent--fix-login`) |

#### Private state

| Property          | Description                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`         | The active `Session.Handle`, set during `initialize()`                                                                                                                                          |
| `loopPayload`     | The `LoopPayload` built up across `initialize()` / `setTools()` / `start()`, containing `context` (system prompt, messages, tools), `config` (stream function), and `signal` (abort controller) |
| `abortController` | Controls cancellation of the agent loop                                                                                                                                                         |

### Initialization

Before an automaton can run, `initialize()` must be called with:

1. **`stream`** — the resolved LLM stream function (set on `loopPayload.config`).
2. **`tools`** — the initial set of `AgentTool`s (added via `setTools("add", ...)`).
3. **`choice`** — the session selection (see below).
4. **`abortController`** (optional) — for external cancellation; a new one is created if omitted.

Initialization:

- Creates or loads the session based on the choice.
- Loads the session's message history into `loopPayload.context.messages`.
- Sets `loopPayload.context.systemPrompt` from the session's stored system prompt.
- Configures the abort signal.

### Session selection

The `SessionChoice` determines which session the automaton uses:

| Choice                                          | Behavior                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ type: "fresh", systemPrompt? }`              | Creates a new empty session. If `systemPrompt` is provided, it is stored as `system.md` in the session folder and used for all LLM calls.                                                                                                       |
| `{ type: "resume", sessionId }`                 | Loads an existing session and continues from where it left off. The message history and system prompt are restored from disk.                                                                                                                   |
| `{ type: "copy", sourceSessionId }`             | Creates a new session that is a full copy of the source. All messages are duplicated. The new session's metadata includes a parent reference with reason `"copy"`.                                                                              |
| `{ type: "compact", sourceSessionId, compact }` | Creates a new session from a condensed version of the source. The caller-provided `compact` function receives the full message history and returns the summarized messages for the new session. The parent reference has reason `"compaction"`. |

### Tool management

Tools are managed via the `setTools` method with three modes:

```ts
automaton.setTools("add", toolA, toolB); // add (deduplicates)
automaton.setTools("remove", toolA); // remove specific tools
automaton.setTools("clear"); // remove all tools
```

Tools are stored on `loopPayload.context.tools` and are passed to the LLM on each call.

### Running the agent loop

The caller drives the conversation in a loop:

1. **`addUserMessage(message)`** — persists the user message to the session on disk and appends it to `loopPayload.context.messages`. This must be called before `start()` to provide the next user turn.

2. **`start()`** — validates readiness (session initialized, stream/context/signal all present) and kicks off `agentLoop()`. Returns the event stream. Internally calls `handleEventStream()` to process events as they arrive.

### Event handling and session persistence

The `handleEventStream` method iterates over every event from the agent loop. Persistence happens on two events:

**`message_end`** — every finalized message is persisted to the session and appended to `loopPayload.context.messages`. This covers:

- **Assistant messages** — the LLM's response after streaming completes.
- **Tool result messages** — results from tool execution.
- **Steering / follow-up user messages** — injected mid-loop by `getSteeringMessages` or `getFollowUpMessages` callbacks.

The initial user message (added via `addUserMessage` before the loop) is NOT re-emitted by the loop, so there is no double-write.

**`turn_end`** — advances `session.nextTurnIndex` to keep the session handle in sync with what's on disk.

All events (not just the ones that trigger persistence) are forwarded via `this.fire(event.type, event)` so that external listeners receive the full event stream.

#### Why `message_end` and not `turn_end`?

A `turn_end` event only carries the assistant message and its tool results. It does NOT include steering or follow-up user messages injected mid-loop. Persisting on `message_end` catches all three message types uniformly.

#### Why the context array copy is correct

The agent loop creates a shallow copy of `context.messages` (`[...context.messages, ...newMessages]`) and operates on that copy. This is intentional — `streamAssistantResponse` does in-place mutations on the array during streaming (pushing partial messages, overwriting `messages[messages.length - 1]` as deltas arrive). The copy protects the automaton's canonical array from seeing intermediate, half-formed messages. The automaton's array only receives finalized messages via `handleEventStream`.

### Finishing

When the automaton has no more work to do (the agent loop exits and the user sends no follow-up), the caller invokes `finish(strategy)`. This always:

1. **Commits** all uncommitted changes in the worktree (`git add -A && git commit`).
2. **Pushes** the branch to the remote (defaults to `origin`).

Then executes the chosen strategy:

| Strategy                              | Behavior                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ type: "pr" }`                      | Returns the branch name for the caller to create a PR via their platform's API (GitHub CLI, GitLab API, etc.). The worktree is NOT removed — the caller may want to make follow-up changes after code review.                                                                         |
| `{ type: "merge", targetCwd, noFf? }` | Merges the automaton's branch into whatever branch is checked out at `targetCwd` (typically a parent automaton's worktree or the main checkout). The worktree is removed after a successful merge. Useful for sub-automata that perform a specific task and merge back into a parent. |
| `{ type: "dispose" }`                 | Removes the worktree. The branch remains pushed, so session data and file changes are preserved in the remote history. Useful for throwaway automata whose changes don't need to be merged.                                                                                           |

In all cases the branch is pushed before any disposal, ensuring session data is never lost.

### `FinishResult`

```ts
{
  commitSha: string | null;   // SHA of the session-data commit (null if clean)
  branch: string;              // the automaton's branch name
  disposed: boolean;           // whether the worktree was removed
  mergeSha?: string;           // SHA of the merge commit (merge strategy only)
}
```

### Directory layout

```
<repo>/
├── .worktrees/
│   ├── agent--fix-login/              # worktree for agent/fix-login
│   │   ├── .sessions/
│   │   │   ├── .gitignore
│   │   │   ├── .gitattributes
│   │   │   ├── walle-xYz789AbCdEf/
│   │   │   │   ├── system.md
│   │   │   │   ├── 0000-user.md
│   │   │   │   ├── 0001-assistant-claude-4-opus-text.md
│   │   │   │   ├── 0001-assistant-claude-4-opus-meta.json
│   │   │   │   └── …
│   │   │   ├── walle-xYz789AbCdEf.zip
│   │   │   └── walle-xYz789AbCdEf.json
│   │   ├── src/
│   │   └── …                          # working tree files
│   └── agent--sub-task/               # another automaton's worktree
└── …                                  # main checkout
```

### Summary of static methods

| Method                             | Description                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Automaton.TryCreate(opts)`        | Create a new automaton. Returns `branch_exists` if the branch exists and `confirmed` is not set. Otherwise creates the worktree (or reuses an existing one) and returns a new `Automaton` instance. |
| `Automaton.Load(repoRoot, branch)` | Rehydrate an automaton for a branch with an existing worktree. Throws if no worktree is found.                                                                                                      |

### Summary of instance methods

| Method                                                | Description                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `initialize(stream, tools, choice, abortController?)` | Set up the LLM stream, tools, session, and abort signal. Must be called before `start()`. |
| `addUserMessage(message)`                             | Persist a user message to the session and add to context. Call before `start()`.          |
| `start()`                                             | Kick off the agent loop. Returns the event stream.                                        |
| `setTools(request, ...tools)`                         | Add, remove, or clear tools.                                                              |
| `finish(strategy, opts?)`                             | Commit, push, and execute the finish strategy.                                            |
| `get sessions`                                        | List all sessions in the worktree.                                                        |
| `set stream`                                          | Update the LLM stream function.                                                           |
