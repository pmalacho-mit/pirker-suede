import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getDevcontainerId } from "@release/api/utils/devcontainer";
import { docker, container, image } from "@release/api/utils/docker";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(THIS_DIR, "../../..");
const DOCKER_CONTEXT = path.join(ROOT_DIR, "release", "docker", "browser");
const VITE_BIN = path.join(ROOT_DIR, "node_modules", "vite", "bin", "vite.js");
const VITE_ROOT = path.join(THIS_DIR, ".vite-test-app");

const IMAGE_TAG = "pirker-browser-control-test:local";
const CONTAINER_NAME = `pirker-browser-vite-test-${Date.now()}`;
const VITE_PORT = 4317;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttpReady = async (
  url: string,
  timeoutMs: number,
): Promise<void> => {
  const start = Date.now();
  let lastErr = "unknown";

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
    }
    await sleep(200);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastErr}`);
};

describe.sequential("docker browser + explicit vite app", () => {
  let dockerAvailable = false;
  let containerStarted = false;
  let devcontainerId = "";
  let viteProcess: ChildProcess | null = null;
  let viteLogs = "";

  beforeAll(async () => {
    dockerAvailable = await docker.verify();
    if (!dockerAvailable) return;

    try {
      if (!process.env.FORCE_REBUILD) await image.inspect(IMAGE_TAG);
      else throw new Error("FORCE_REBUILD set");
    } catch {
      await image.build(IMAGE_TAG, DOCKER_CONTEXT);
    }

    devcontainerId = await getDevcontainerId();

    // Ensure fixture files exist; they are intentionally committed in tests/docker/browser/vite.
    await fs.access(path.join(VITE_ROOT, "index.html"));
    await fs.access(path.join(VITE_ROOT, "main.js"));
    await fs.access(path.join(VITE_ROOT, "vite.config.ts"));

    viteProcess = spawn(
      process.execPath,
      [VITE_BIN, "--config", path.join(VITE_ROOT, "vite.config.ts")],
      {
        cwd: VITE_ROOT,
        env: { ...process.env, CI: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    viteProcess.stdout?.on("data", (chunk) => {
      viteLogs += chunk.toString();
    });
    viteProcess.stderr?.on("data", (chunk) => {
      viteLogs += chunk.toString();
    });

    try {
      await waitForHttpReady(`http://127.0.0.1:${VITE_PORT}`, 20_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Vite failed to start: ${message}\n${viteLogs}`);
    }

    await container.run({
      name: CONTAINER_NAME,
      image: IMAGE_TAG,
      network: `container:${devcontainerId}`,
      command: ["tail", "-f", "/dev/null"],
    });
    containerStarted = true;

    const started = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/start.js",
    ]);
    expect(started.stdout + started.stderr).toContain("Starting");
  }, 600_000);

  afterAll(async () => {
    if (viteProcess) {
      viteProcess.kill("SIGTERM");
      await sleep(300);
      if (!viteProcess.killed) viteProcess.kill("SIGKILL");
      viteProcess = null;
    }

    if (!dockerAvailable || !containerStarted) return;
    try {
      await container.remove(CONTAINER_NAME);
    } catch {
      // Best-effort cleanup.
    }
  });

  test("chrome in docker can connect to vite host=0.0.0.0 on explicit port", async (context) => {
    if (!dockerAvailable) context.skip();

    const appUrl = `http://127.0.0.1:${VITE_PORT}`;

    const nav = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/nav.js",
      appUrl,
    ]);
    expect(nav.stdout).toContain(appUrl);

    const waited = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/wait.js",
      "#vite-ready",
      "--timeout",
      "10",
    ]);
    expect(waited.stdout).toContain("Found");

    const dom = await docker.exec(CONTAINER_NAME, ["/app/scripts/dom.js"]);
    expect(dom.stdout).toContain("Vite Browser Test");

    const text = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/eval.js",
      "document.querySelector('#vite-ready').textContent",
    ]);
    expect(text.stdout).toContain("hello-from-vite");

    const port = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/eval.js",
      "document.querySelector('#vite-port').textContent",
    ]);
    expect(port.stdout).toContain(String(VITE_PORT));
  }, 120_000);
});
