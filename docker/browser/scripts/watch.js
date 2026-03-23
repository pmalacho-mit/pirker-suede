#!/usr/bin/env node
// scripts/watch.js  –  Background logger (console + JS errors + network)
//
// Usage:
//   ./scripts/watch.js           # attach to first tab, log to LOG_DIR
//   ./scripts/watch.js --target <id>
//
// Logs are written as JSONL to:
//   $LOG_DIR/<date>/<targetId>.jsonl

import { connect, listTargets, printHelp } from "./lib.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @typedef {{ ts?: number, kind: string, [key: string]: unknown }} LogEntry
 */

const args = process.argv.slice(2);
const tIdx = args.indexOf("--target");
const targetId = tIdx !== -1 ? args[tIdx + 1] : undefined;
const LOG_DIR = process.env.LOG_DIR || "/tmp/browser-logs";

try {
  let client;
  /** @type {string} */
  let tid;
  if (targetId) {
    tid = targetId;
    client = await connect(targetId);
  } else {
    const targets = await listTargets();
    if (targets.length === 0) {
      console.error("No open tabs.");
      process.exit(1);
    }
    tid = targets[0].id;
    client = await connect(tid);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const logDir = join(LOG_DIR, dateStr);
  mkdirSync(logDir, { recursive: true });

  const logFile = join(logDir, `${tid}.jsonl`);

  /**
   * @param {LogEntry} entry
   */
  function log(entry) {
    const line = JSON.stringify({ ts: Date.now(), ...entry });
    appendFileSync(logFile, line + "\n");
    // Also mirror to stdout for live tailing
    console.log(line);
  }

  // Console messages
  client.Runtime.consoleAPICalled(({ type, args: callArgs }) => {
    const text = callArgs.map((a) => a.value ?? a.description ?? "").join(" ");
    log({ kind: "console", level: type, text });
  });

  // Uncaught exceptions
  client.Runtime.exceptionThrown(({ exceptionDetails }) => {
    const msg =
      exceptionDetails.exception?.description ||
      exceptionDetails.text ||
      "Unknown";
    log({ kind: "error", message: msg });
  });

  // Network request started
  client.Network.requestWillBeSent(({ requestId, request }) => {
    log({
      kind: "net:request",
      id: requestId,
      method: request.method,
      url: request.url,
    });
  });

  // Network response received
  client.Network.responseReceived(({ requestId, response }) => {
    log({
      kind: "net:response",
      id: requestId,
      status: response.status,
      mime: response.mimeType,
      url: response.url,
    });
  });

  // Network request failed
  client.Network.loadingFailed(({ requestId, errorText }) => {
    log({ kind: "net:failed", id: requestId, error: errorText });
  });

  console.error(`\n✔ Watching tab ${tid}`);
  console.error(`  Log file: ${logFile}`);
  console.error("  Press Ctrl+C to stop.\n");

  // Keep process alive
  process.on("SIGINT", async () => {
    console.error("\nStopping watcher.");
    await client.close();
    process.exit(0);
  });
} catch (err) {
  console.error("watch failed:", err.message);
  process.exit(1);
}
