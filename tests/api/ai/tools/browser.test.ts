import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { createBrowserTool } from "@release/api/ai/tools";
import { docker, container, image } from "@release/api/utils/docker";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(THIS_DIR, "../../..");
const DOCKER_CONTEXT = path.join(ROOT_DIR, "release", "docker", "browser");
// Reuse the same image tag as index.test.ts to avoid redundant builds.
const IMAGE_TAG = "pirker-browser-control-test:local";

const SCRIPT_DOC_NAMES = [
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
];

describe.sequential("createBrowserTool", () => {
  let dockerAvailable = false;
  // Accumulated across each test; flushed in afterEach.
  const spawnedContainers: string[] = [];

  beforeAll(async () => {
    dockerAvailable = await docker.verify();
    if (!dockerAvailable) return;

    try {
      if (!process.env.FORCE_REBUILD) {
        await image.inspect(IMAGE_TAG);
      } else {
        throw new Error("FORCE_REBUILD set");
      }
    } catch {
      await image.build(IMAGE_TAG, DOCKER_CONTEXT);
    }
  }, 600_000);

  afterEach(async () => {
    for (const name of spawnedContainers.splice(0)) {
      try {
        await container.remove(name, true);
      } catch {
        // already removed or never started — ignore
      }
    }
  });

  // Narrow the first content block to its text string.
  const getText = (result: Awaited<ReturnType<typeof exec>>) =>
    (result.content[0] as { type: "text"; text: string }).text;

  // Helper: call execute and track the spawned container for cleanup.
  const exec = async (
    tool: ReturnType<typeof createBrowserTool>,
    input: Record<string, boolean | undefined> = {},
  ) => {
    const result = await tool.execute("test-call-id", input);
    const { containerName } = result.details as { containerName: string };
    if (!spawnedContainers.includes(containerName)) {
      spawnedContainers.push(containerName);
    }
    return result;
  };

  // ── Static shape tests (no Docker required) ────────────────────────────────

  test("tool has correct name, label, and schema", () => {
    const tool = createBrowserTool("/tmp");
    expect(tool.name).toBe("browser");
    expect(tool.label).toBe("browser");
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
  });

  test("two tool instances get independent container names", async (context) => {
    if (!dockerAvailable) context.skip();

    const t1 = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const t2 = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const r1 = await exec(t1);
    const r2 = await exec(t2);

    expect(r1.details.containerName).not.toBe(r2.details.containerName);
  }, 60_000);

  // ── Lifecycle tests ────────────────────────────────────────────────────────

  test("first call starts container and returns status=started", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const result = await exec(tool);
    const { containerName, status, image: img } = result.details as any;

    expect(status).toBe("started");
    expect(img).toBe(IMAGE_TAG);
    expect(await container.isRunning(containerName)).toBe(true);
  }, 60_000);

  test("second call on the same instance returns status=already-running", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    await exec(tool);
    const result = await exec(tool);

    expect(result.details.status).toBe("already-running");
    expect(await container.isRunning(result.details.containerName)).toBe(true);
  }, 60_000);

  test("restart=true removes and recreates the container", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    await exec(tool);
    const result = await exec(tool, { restart: true });

    expect(result.details.status).toBe("restarted");
    expect(await container.isRunning(result.details.containerName)).toBe(true);
  }, 60_000);

  test("stop=true removes the container and returns status=stopped", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const started = await exec(tool);
    const { containerName } = started.details as any;

    const stopped = await exec(tool, { stop: true });
    expect(stopped.details.status).toBe("stopped");

    // Container must no longer exist.
    let exists = true;
    try {
      await container.inspect(containerName);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  }, 60_000);

  // ── Output content tests ───────────────────────────────────────────────────

  test("result text contains container name and exec examples", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const result = await exec(tool);
    const text = getText(result);
    const { containerName } = result.details as any;

    expect(text).toContain(containerName);
    expect(text).toContain(`docker exec ${containerName}`);
  }, 60_000);

  test("result text contains cleanup reminder", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const result = await exec(tool);

    expect(getText(result)).toContain("stop=true");
  }, 60_000);

  test("result text embeds docs for every script", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    const result = await exec(tool);
    const text = getText(result);

    for (const docName of SCRIPT_DOC_NAMES) {
      expect(text).toContain(docName);
    }
  }, 60_000);

  test("stopped result text contains recovery hint", async (context) => {
    if (!dockerAvailable) context.skip();

    const tool = createBrowserTool("/tmp", { image: IMAGE_TAG });
    await exec(tool);
    const result = await exec(tool, { stop: true });
    const text = getText(result);

    expect(text).toContain("restart=true");
  }, 60_000);
});
