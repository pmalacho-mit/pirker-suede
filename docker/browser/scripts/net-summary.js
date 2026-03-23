#!/usr/bin/env node
// scripts/net-summary.js  –  Summarize network activity from logs
//
// Usage:
//   ./scripts/net-summary.js              # summary of latest log
//   ./scripts/net-summary.js --errors     # show only failed requests

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

const args = process.argv.slice(2);
const errorsOnly = args.includes("--errors");
const LOG_DIR = process.env.LOG_DIR || "/tmp/browser-logs";

function findLatestLog() {
  try {
    const dates = readdirSync(LOG_DIR).sort().reverse();
    for (const d of dates) {
      const dir = join(LOG_DIR, d);
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse();
      if (files.length > 0) return join(dir, files[0]);
    }
  } catch {
    /* empty */
  }
  return null;
}

const logFile = findLatestLog();
if (!logFile) {
  console.error("No log files found.");
  process.exit(1);
}

const lines = readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
const requests = new Map(); // id -> { method, url, status, mime, error }
const byStatus = {};
const byMime = {};
let totalRequests = 0;
let failures = 0;

for (const line of lines) {
  try {
    const e = JSON.parse(line);
    if (e.kind === "net:request") {
      requests.set(e.id, { method: e.method, url: e.url });
      totalRequests++;
    } else if (e.kind === "net:response") {
      const r = requests.get(e.id) || {};
      r.status = e.status;
      r.mime = e.mime;
      r.url = r.url || e.url;
      requests.set(e.id, r);

      const bucket = `${e.status}`;
      byStatus[bucket] = (byStatus[bucket] || 0) + 1;
      const mime = e.mime || "unknown";
      byMime[mime] = (byMime[mime] || 0) + 1;
    } else if (e.kind === "net:failed") {
      const r = requests.get(e.id) || {};
      r.error = e.error;
      requests.set(e.id, r);
      failures++;
    }
  } catch {
    /* skip bad lines */
  }
}

if (errorsOnly) {
  console.log(`\nFailed requests (${failures}):\n`);
  for (const [, r] of requests) {
    if (r.error) {
      console.log(`  ${r.method || "?"} ${r.url}`);
      console.log(`    Error: ${r.error}\n`);
    }
    if (r.status && r.status >= 400) {
      console.log(`  ${r.method || "?"} ${r.url}`);
      console.log(`    Status: ${r.status}\n`);
    }
  }
} else {
  console.log(`\nNetwork Summary`);
  console.log(`───────────────`);
  console.log(`  Total requests:  ${totalRequests}`);
  console.log(`  Failures:        ${failures}`);
  console.log();

  console.log("  By status:");
  for (const [status, count] of Object.entries(byStatus).sort())
    console.log(`    ${status}: ${count}`);
  console.log();

  console.log("  By MIME:");
  for (const [mime, count] of Object.entries(byMime).sort(
    (a, b) => b[1] - a[1],
  ))
    console.log(`    ${mime}: ${count}`);
}
