import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { docker, image, container } from "@release/api/utils/docker";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(THIS_DIR, "../../..");
const DOCKER_CONTEXT = path.join(ROOT_DIR, "release", "docker", "browser");
const IMAGE_TAG = "pirker-browser-control-test:local";
const CONTAINER_NAME = `pirker-browser-control-test-${Date.now()}`;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const makeDataUrl = (html: string): string =>
  `data:text/html,${encodeURIComponent(html)}`;

describe.sequential("docker browser control scripts", () => {
  let dockerAvailable = false;
  let containerStarted = false;

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

    await container.run({
      name: CONTAINER_NAME,
      image: IMAGE_TAG,
      command: ["tail", "-f", "/dev/null"],
    });
    containerStarted = true;

    const started = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/start.js",
    ]);
    expect(started.stdout + started.stderr).toContain("Starting");
  }, 600_000);

  afterAll(async () => {
    if (!dockerAvailable || !containerStarted) return;
    try {
      await container.remove(CONTAINER_NAME);
    } catch {
      // Best-effort cleanup.
    }
  });

  test("starts chromium and exposes CDP endpoint", async (context) => {
    if (!dockerAvailable) context.skip();

    const version = await docker.exec(CONTAINER_NAME, [
      "curl",
      "-fsS",
      "http://127.0.0.1:9222/json/version",
    ]);
    expect(version.stdout).toContain("webSocketDebuggerUrl");

    const tabs = await docker.exec(CONTAINER_NAME, ["/app/scripts/tabs.js"]);
    expect(tabs.stdout).toContain("tab(s)");
  });

  test("navigates and inspects DOM content", async (context) => {
    if (!dockerAvailable) context.skip();

    const pageUrl = makeDataUrl(`
			<!doctype html>
			<html>
				<head><title>Browser Toolkit E2E</title></head>
				<body>
					<main id="main" class="ready">
						<h1>Browser Toolkit Test Page</h1>
						<input id="q" name="q" placeholder="query" value="prefilled" />
						<button id="go">Go</button>
						<a id="docs" href="https://example.test/docs">Docs</a>
						<div id="status" data-state="ready">ready</div>
					</main>
					<script>
						const q = document.querySelector('#q');
						const status = document.querySelector('#status');
						document.querySelector('#go').addEventListener('click', () => {
							status.setAttribute('data-state', 'clicked');
							status.textContent = 'clicked:' + q.value;
							console.log('BUTTON_CLICKED', q.value);
						});
						q.addEventListener('keydown', (event) => {
							if (event.key === 'Enter') {
								status.setAttribute('data-state', 'enter');
								status.textContent = 'enter:' + q.value;
								console.log('ENTER_PRESSED', q.value);
							}
						});
					</script>
				</body>
			</html>
		`);

    const nav = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/nav.js",
      pageUrl,
    ]);
    expect(nav.stdout).toContain("data:text/html");

    const waited = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/wait.js",
      "#status[data-state='ready']",
      "--timeout",
      "5",
    ]);
    expect(waited.stdout).toContain("Found");

    const domOverview = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/dom.js",
    ]);
    expect(domOverview.stdout).toContain("Browser Toolkit E2E");
    expect(domOverview.stdout).toContain("Headings");

    const domInputs = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/dom.js",
      "--inputs",
    ]);
    expect(domInputs.stdout).toContain("interactive element(s)");
    expect(domInputs.stdout).toContain("#q");

    const domLinks = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/dom.js",
      "--links",
    ]);
    expect(domLinks.stdout).toContain("Docs");

    const domText = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/dom.js",
      "--text",
      "#main",
    ]);
    expect(domText.stdout).toContain("Browser Toolkit Test Page");
  }, 120_000);

  test("types text, clicks, evaluates JS, and captures screenshots", async (context) => {
    if (!dockerAvailable) context.skip();

    const typed = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/type.js",
      "#q",
      "docker-e2e",
      "--clear",
      "--enter",
    ]);
    expect(typed.stdout).toContain("Typed");
    expect(typed.stdout).toContain("Pressed Enter");

    const clicked = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/click.js",
      "#go",
      "--wait",
      "0.2",
    ]);
    expect(clicked.stdout).toContain("Clicked at");

    const waited = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/wait.js",
      "#status[data-state='clicked']",
      "--timeout",
      "5",
    ]);
    expect(waited.stdout).toContain("Found");

    const evalStatus = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/eval.js",
      "document.querySelector('#status').textContent",
    ]);
    expect(evalStatus.stdout).toContain("clicked:docker-e2e");

    const shot = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/screenshot.js",
      "--full",
    ]);
    const screenshotPath = shot.stdout.trim();
    expect(screenshotPath).toContain("/tmp/browser-logs/screenshots/");

    const size = await docker.exec(CONTAINER_NAME, [
      "bash",
      "-lc",
      `test -s ${screenshotPath} && echo OK`,
    ]);
    expect(size.stdout.trim()).toBe("OK");
  }, 120_000);

  test("collects logs and summarizes network failures", async (context) => {
    if (!dockerAvailable) context.skip();

    await docker([
      "exec",
      "-d",
      CONTAINER_NAME,
      "bash",
      "-lc",
      "/app/scripts/watch.js > /tmp/watch.log 2>&1",
    ]);

    await sleep(800);

    await docker.exec(CONTAINER_NAME, [
      "/app/scripts/eval.js",
      "console.log('WATCH_E2E_MARKER')",
    ]);
    await docker.exec(CONTAINER_NAME, [
      "/app/scripts/eval.js",
      "fetch('http://127.0.0.1:1/boom').catch(() => 'failed')",
    ]);

    await sleep(1200);

    const tailed = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/logs-tail.js",
      "--kind",
      "console",
    ]);
    expect(tailed.stdout).toContain("WATCH_E2E_MARKER");

    const summary = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/net-summary.js",
    ]);
    expect(summary.stdout).toContain("Network Summary");

    const errors = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/net-summary.js",
      "--errors",
    ]);
    expect(errors.stdout).toContain("Failed requests");
  }, 120_000);

  test("--help flag prints usage for dom.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/dom.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/dom.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--links");
    expect(result.stdout).toContain("--inputs");
  });

  test("--help flag prints usage for nav.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/nav.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/nav.js");
    expect(result.stdout).toContain("Usage:");
  });

  test("--help flag prints usage for eval.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/eval.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/eval.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--stdin");
  });

  test("--help flag prints usage for click.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/click.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/click.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--xy");
  });

  test("--help flag prints usage for type.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/type.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/type.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--clear");
  });

  test("--help flag prints usage for wait.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/wait.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/wait.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--timeout");
  });

  test("--help flag prints usage for screenshot.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/screenshot.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/screenshot.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--full");
  });

  test("--help flag prints usage for start.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/start.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/start.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--port");
  });

  test("--help flag prints usage for tabs.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/tabs.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/tabs.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--close");
  });

  test("--help flag prints usage for watch.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/watch.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/watch.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--target");
  });

  test("--help flag prints usage for logs-tail.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/logs-tail.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/logs-tail.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--follow");
  });

  test("--help flag prints usage for net-summary.js", async (context) => {
    if (!dockerAvailable) context.skip();

    const result = await docker.exec(CONTAINER_NAME, [
      "/app/scripts/net-summary.js",
      "--help",
    ]);
    expect(result.stdout).toContain("scripts/net-summary.js");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--errors");
  });
});
