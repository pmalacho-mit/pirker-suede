#!/usr/bin/env node
// scripts/start.js  –  Launch headless Chromium with remote debugging
//
// Usage:
//   ./scripts/start.js                       # default (blank profile)
//   ./scripts/start.js --port 9333           # custom CDP port
//   ./scripts/start.js --user-data-dir /tmp/my-profile

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} name
 * @param {string | undefined} value
 * @returns {number}
 */
const parsePositiveInt = (name, value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

/**
 * Polls CDP endpoint until ready or timeout.
 * @param {number} port
 * @param {number} attempts
 * @param {number} delayMs
 * @returns {Promise<{Browser?: string, webSocketDebuggerUrl?: string}>}
 */
const waitForCdpReady = async (port, attempts, delayMs) => {
  let lastError = "Unknown error";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return /** @type {{Browser?: string, webSocketDebuggerUrl?: string}} */ (
        await res.json()
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await sleep(delayMs);
    }
  }

  throw new Error(lastError);
};

const args = process.argv.slice(2);
const CDP_PORT = process.env.CDP_PORT || "9222";
const CHROME_BIN = process.env.CHROME_BIN || "chromium";
const LOG_DIR = process.env.LOG_DIR || "/tmp/browser-logs";

// Parse --port override
let port = CDP_PORT;
const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  port = args[portIdx + 1];
  args.splice(portIdx, 2);
}
const portNumber = parsePositiveInt("--port", port);

// Parse --user-data-dir override
let userDataDir = `/tmp/chromium-profile-${port}`;
const udIdx = args.indexOf("--user-data-dir");
if (udIdx !== -1 && args[udIdx + 1]) {
  userDataDir = args[udIdx + 1];
  args.splice(udIdx, 2);
}

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(userDataDir, { recursive: true });

const chromeFlags = [
  "--headless=new",
  `--remote-debugging-port=${portNumber}`,
  "--remote-debugging-address=0.0.0.0",
  `--user-data-dir=${userDataDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--disable-translate",
  "--disable-gpu",
  "--no-sandbox", // required inside Docker
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage", // /dev/shm is small in containers
  "--window-size=1920,1080",
  "about:blank",
  ...args, // pass-through any extra flags
];

console.error(`Starting ${CHROME_BIN} on CDP port ${portNumber} ...`);
console.error(`  Profile: ${userDataDir}`);
console.error(`  Logs:    ${LOG_DIR}`);

const child = spawn(CHROME_BIN, chromeFlags, {
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

child.stdout.on("data", (d) => process.stdout.write(d));
child.stderr.on("data", (d) => process.stderr.write(d));

child.on("error", (err) => {
  console.error("Failed to start browser:", err.message);
  process.exit(1);
});

try {
  const info = await waitForCdpReady(portNumber, 20, 500);
  console.log(`\n✔ Browser ready`);
  console.log(`  ${info.Browser}`);
  console.log(`  WebSocket: ${info.webSocketDebuggerUrl}`);
  console.log(`  CDP:       http://127.0.0.1:${portNumber}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("\n✘ Could not reach CDP endpoint after retries.");
  console.error(`  Last error: ${message}`);
  console.error(`  Try: curl http://127.0.0.1:${portNumber}/json/version`);
  process.exit(1);
}

// Detach so the script can exit while Chrome keeps running
child.unref();
