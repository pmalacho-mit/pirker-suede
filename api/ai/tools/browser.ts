import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentTool } from "../agent/types.js";
import { image, container } from "../../utils/docker.js";

const browserSchema = Type.Object({
  restart: Type.Optional(
    Type.Boolean({
      description:
        "Restart container before use (remove existing instance, then start fresh)",
    }),
  ),
  stop: Type.Optional(
    Type.Boolean({
      description:
        "Stop/remove this tool instance container instead of preparing it for use",
    }),
  ),
});

export type BrowserToolInput = Static<typeof browserSchema>;

const SCRIPT_DOC_FILES = [
  "NAV.md",
  "EVAL.md",
  "SCREENSHOT.md",
  "CLICK.md",
  "TYPE.md",
  "WAIT.md",
  "DOM.md",
  "TABS.md",
  "WATCH.md",
  "LOGS-TAIL.md",
  "NET-SUMMARY.md",
] as const;

function getBrowserPaths() {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  const browserDir = resolve(thisDir, "../../../docker/browser");
  const docsDir = resolve(browserDir, "scripts");
  return { browserDir, docsDir };
}

function readScriptDocs(docsDir: string): string {
  const sections = SCRIPT_DOC_FILES.map((fileName) => {
    const absolutePath = resolve(docsDir, fileName);
    if (!existsSync(absolutePath)) {
      throw new Error(`Browser script docs file not found: ${absolutePath}`);
    }
    const content = readFileSync(absolutePath, "utf-8").trimEnd();
    return `## ${fileName}\n\n${content}`;
  });
  return sections.join("\n\n");
}

async function containerExists(name: string): Promise<boolean> {
  try {
    await container.inspect(name);
    return true;
  } catch {
    return false;
  }
}

async function containerIsRunning(name: string): Promise<boolean> {
  try {
    return await container.isRunning(name);
  } catch {
    return false;
  }
}

async function ensureBrowserImage(name: string, browserDir: string) {
  try {
    await image.inspect(name);
  } catch {
    await image.build(name, browserDir);
  }
}

type BrowserStatus = "started" | "already-running" | "restarted" | "stopped";

async function ensureContainerState({
  name,
  image,
  restart,
  stop,
}: {
  name: string;
  image: string;
  restart: boolean;
  stop: boolean;
}): Promise<BrowserStatus> {
  const exists = await containerExists(name);

  if (stop) {
    if (exists) await container.remove(name, true);
    return "stopped";
  }

  if (restart) {
    if (exists) await container.remove(name, true);
    await container.run({
      name,
      image,
      command: ["tail", "-f", "/dev/null"],
      detached: true,
      removeOnStop: false,
    });
    return "restarted";
  }

  if (!exists) {
    await container.run({
      name,
      image,
      command: ["tail", "-f", "/dev/null"],
      detached: true,
      removeOnStop: false,
    });
    return "started";
  }

  if (await containerIsRunning(name)) return "already-running";

  await container.start(name);
  return "started";
}

export interface BrowserToolOptions {
  /** Docker image tag. Default: "pirker-browser-control" */
  image?: string;
}

export function createBrowserTool(
  _cwd: string,
  options?: BrowserToolOptions,
): AgentTool<typeof browserSchema> {
  const { browserDir, docsDir } = getBrowserPaths();
  const docsText = readScriptDocs(docsDir);
  const image = options?.image ?? "pirker-browser-control";
  const instanceId = randomBytes(4).toString("hex");
  const containerName = `pi-browser-${instanceId}`;

  return {
    name: "browser",
    label: "browser",
    description:
      "Start/manage a dedicated browser-control Docker container and return bash instructions for interacting with browser scripts.",
    parameters: browserSchema,
    execute: async (
      _toolCallId: string,
      { restart, stop }: { restart?: boolean; stop?: boolean },
    ) => {
      await ensureBrowserImage(image, browserDir);

      const status = await ensureContainerState({
        name: containerName,
        image,
        restart: restart ?? false,
        stop: stop ?? false,
      });

      const lifecycleText =
        status === "stopped"
          ? `Container ${containerName} is stopped/removed.`
          : `Container ${containerName} is ${status}.`;

      const interactionText =
        status === "stopped"
          ? `To start it again, call this tool without flags (or with restart=true).`
          : [
              "Use the bash tool to run commands like:",
              `docker exec ${containerName} ./scripts/nav.js https://example.com`,
              `docker exec ${containerName} ./scripts/dom.js --links`,
              `docker exec ${containerName} ./scripts/screenshot.js --full`,
            ].join("\n");

      const reminder =
        "IMPORTANT: Always stop/remove this browser container when you are done with it or when you expect an idle period. Use this tool with stop=true to clean it up.";

      const text = [
        lifecycleText,
        interactionText,
        reminder,
        "",
        "Script usage docs:",
        docsText,
      ].join("\n\n");

      return {
        content: [{ type: "text", text }],
        details: {
          containerName,
          image,
          status,
        },
      };
    },
  };
}
