import process from "node:process";
import readline from "node:readline/promises";
import { user } from "./ai/agent/index.js";
import {
  getModelStream,
  getModelsForProvider,
  getProviders,
} from "./ai/models/index.js";
import { createCodingTools, createReadOnlyTools } from "./ai/tools/index.js";
import { Automaton, type Automata } from "./automata/index.js";
import { repoRoot } from "./utils/git.js";

type SessionMode = "fresh" | "resume" | "copy";
type Toolset = "coding" | "readonly";

type CliOptions = {
  repoRoot?: string;
  branch: string;
  baseBranch?: string;
  confirmExistingBranch: boolean;
  provider?: string;
  model?: string;
  sessionMode: SessionMode;
  sessionId?: string;
  systemPrompt?: string;
  prompt?: string;
  toolset: Toolset;
};

const HELP_TEXT = [
  "Usage: tsx release/api/cli.ts --branch <branch> [options]",
  "",
  "Required:",
  "  --branch <name>                 Branch for the automaton worktree",
  "",
  "Session options:",
  "  --session <fresh|resume|copy>   Session mode (default: fresh)",
  "  --session-id <id>               Required for resume/copy",
  "  --system-prompt <text>          System prompt for fresh session",
  "",
  "Model options:",
  "  --provider <name>               Model provider (defaults to first provider with API key)",
  "  --model <name>                  Model name (defaults to provider's first model)",
  "",
  "Repo/worktree options:",
  "  --repo-root <path>              Repository root (default: git rev-parse --show-toplevel)",
  "  --base-branch <name>            Base branch when creating a new branch",
  "  --confirm-existing-branch       Proceed when branch already exists",
  "",
  "Runtime options:",
  "  --toolset <coding|readonly>     Toolset selection (default: coding)",
  "  --prompt <text>                 Optional initial prompt before interactive mode",
  "  --help                          Show this help",
  "",
  "Interactive commands:",
  "  /exit, /quit, exit, quit        Exit the CLI",
].join("\n");

const parseArgs = (argv: string[]): CliOptions => {
  const opts: CliOptions = {
    branch: "",
    confirmExistingBranch: false,
    sessionMode: "fresh",
    toolset: "coding",
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${token}`);
      return value;
    };

    switch (token) {
      case "--help":
      case "-h":
        console.log(HELP_TEXT);
        process.exit(0);
      case "--repo-root":
        opts.repoRoot = next();
        break;
      case "--branch":
        opts.branch = next();
        break;
      case "--base-branch":
        opts.baseBranch = next();
        break;
      case "--confirm-existing-branch":
        opts.confirmExistingBranch = true;
        break;
      case "--provider":
        opts.provider = next();
        break;
      case "--model":
        opts.model = next();
        break;
      case "--session": {
        const value = next();
        if (value !== "fresh" && value !== "resume" && value !== "copy") {
          throw new Error(`Invalid --session value: ${value}`);
        }
        opts.sessionMode = value;
        break;
      }
      case "--session-id":
        opts.sessionId = next();
        break;
      case "--system-prompt":
        opts.systemPrompt = next();
        break;
      case "--prompt":
        opts.prompt = next();
        break;
      case "--toolset": {
        const value = next();
        if (value !== "coding" && value !== "readonly") {
          throw new Error(`Invalid --toolset value: ${value}`);
        }
        opts.toolset = value;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!opts.branch.trim()) {
    throw new Error("--branch is required");
  }

  if (
    (opts.sessionMode === "resume" || opts.sessionMode === "copy") &&
    !opts.sessionId
  ) {
    throw new Error(
      `--session-id is required for --session ${opts.sessionMode}`,
    );
  }

  return opts;
};

const resolveModelSelection = (providerArg?: string, modelArg?: string) => {
  const providersWithKeys = getProviders("hasApiKey");
  if (providersWithKeys.length === 0) {
    throw new Error(
      "No providers with configured API keys were found. Set an API key in your environment.",
    );
  }

  const provider = (providerArg ??
    providersWithKeys[0]) as (typeof providersWithKeys)[number];
  const models = getModelsForProvider(provider, "hasApiKey");
  if (models.length === 0) {
    throw new Error(`No models available for provider '${provider}'.`);
  }

  const model = (modelArg ?? models[0]) as (typeof models)[number];
  if (!models.includes(model)) {
    throw new Error(
      `Model '${model}' is not available for provider '${provider}'. Available: ${models.join(
        ", ",
      )}`,
    );
  }

  return { provider, model };
};

const getSessionChoice = (opts: CliOptions): Automata.SessionChoice => {
  switch (opts.sessionMode) {
    case "fresh":
      return { type: "fresh", systemPrompt: opts.systemPrompt };
    case "resume":
      return { type: "resume", sessionId: opts.sessionId! };
    case "copy":
      return { type: "copy", sourceSessionId: opts.sessionId! };
  }
};

const renderAssistantText = (message: {
  content: Array<{ type: string; text?: string; name?: string }>;
  stopReason?: string;
}) => {
  const textBlocks = message.content
    .filter(
      (content): content is { type: "text"; text: string } =>
        content.type === "text" && typeof content.text === "string",
    )
    .map((content) => content.text.trim())
    .filter(Boolean);

  if (textBlocks.length > 0) return textBlocks.join("\n\n");

  const toolCalls = message.content
    .filter(
      (content): content is { type: "toolCall"; name: string } =>
        content.type === "toolCall" && typeof content.name === "string",
    )
    .map((content) => content.name);

  if (toolCalls.length > 0) {
    return `Assistant requested tool calls: ${toolCalls.join(", ")}`;
  }

  return message.stopReason
    ? `Assistant completed with stopReason=${message.stopReason}`
    : "(assistant message has no text content)";
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = options.repoRoot ?? (await repoRoot(process.cwd()));
  const { provider, model } = resolveModelSelection(
    options.provider,
    options.model,
  );
  const stream = getModelStream(provider, model);
  const abortController = new AbortController();

  const created = await Automaton.TryCreate({
    repoRoot: root,
    branch: options.branch,
    baseBranch: options.baseBranch,
    confirmed: options.confirmExistingBranch,
  });

  if (created.status === "branch_exists") {
    throw new Error(
      `Branch '${created.branch}' already exists. Re-run with --confirm-existing-branch to proceed.`,
    );
  }

  const automaton = created.automaton;
  const tools =
    options.toolset === "readonly"
      ? createReadOnlyTools(automaton.root)
      : createCodingTools(automaton.root);

  const session = await automaton.initialize(
    stream,
    tools,
    getSessionChoice(options),
    abortController,
  );

  let lastAssistantText = "";
  automaton.subscribe({
    message_end: (event) => {
      if (event.message.role !== "assistant") return;
      lastAssistantText = renderAssistantText(event.message as any);
      console.log(`\nassistant> ${lastAssistantText}\n`);
    },
    tool_execution_start: (event) => {
      console.log(`tool:start ${event.toolName}`);
    },
    tool_execution_end: (event) => {
      console.log(
        `tool:end ${event.toolName}${event.isError ? " (error)" : ""}`,
      );
    },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let shuttingDown = false;
  let currentTurn: Promise<void> | null = null;

  const runTurn = async (prompt: string) => {
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = automaton.once({
        agent_end: () => resolve(),
      });
      try {
        automaton.start([user(prompt)]);
      } catch (error) {
        unsubscribe();
        reject(error);
      }
    });
  };

  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n${reason}`);
    abortController.abort();

    if (currentTurn) {
      try {
        await currentTurn;
      } catch {
        // best-effort wait; output is already emitted via events
      }
    }

    if (lastAssistantText) {
      console.log("Final assistant message:");
      console.log(lastAssistantText);
    }

    rl.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("Interrupt received. Aborting current loop and exiting...");
  });

  console.log(`Automaton ready.`);
  console.log(`repo: ${root}`);
  console.log(`branch: ${automaton.branch}`);
  console.log(`worktree: ${automaton.root}`);
  console.log(`session: ${session.id}`);
  console.log(`model: ${provider}/${model}`);
  console.log("Type /exit to quit. Press Ctrl+C to abort gracefully.");

  if (options.prompt) {
    currentTurn = runTurn(options.prompt);
    await currentTurn;
    currentTurn = null;
  }

  while (!shuttingDown) {
    const line = (await rl.question("you> ")).trim();
    if (!line) continue;
    if (["/exit", "/quit", "exit", "quit"].includes(line)) break;

    currentTurn = runTurn(line);
    await currentTurn;
    currentTurn = null;
  }

  await shutdown("Exiting CLI...");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI error: ${message}`);
  process.exit(1);
});
