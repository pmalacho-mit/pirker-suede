#!/usr/bin/env node
// scripts/logs-tail.js  –  Dump or follow the latest browser log
//
// Usage:
//   ./scripts/logs-tail.js              # dump current log and exit
//   ./scripts/logs-tail.js --follow     # keep tailing
//   ./scripts/logs-tail.js --kind net   # filter by kind (console|error|net:*)

import { readdirSync, readFileSync, watchFile } from "node:fs";
import { join } from "node:path";
import { printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

const args = process.argv.slice(2);
const follow = args.includes("--follow");
const kindIdx = args.indexOf("--kind");
const kindFilter = kindIdx !== -1 ? args[kindIdx + 1] : null;
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

function printLines(content, alreadySeen) {
  const lines = content.split("\n").filter(Boolean);
  for (let i = alreadySeen; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      if (kindFilter && !entry.kind?.startsWith(kindFilter)) continue;

      const time = new Date(entry.ts).toISOString().slice(11, 23);
      const kind = (entry.kind || "?").padEnd(14);
      const detail =
        entry.text ||
        entry.message ||
        (entry.url ? `${entry.status || entry.method || ""} ${entry.url}` : "");
      console.log(`${time}  ${kind}  ${detail}`);
    } catch {
      console.log(lines[i]);
    }
  }
  return lines.length;
}

const logFile = findLatestLog();
if (!logFile) {
  console.error("No log files found. Start watch.js first.");
  process.exit(1);
}

console.error(`Log: ${logFile}\n`);
let seen = printLines(readFileSync(logFile, "utf-8"), 0);

if (follow) {
  watchFile(logFile, { interval: 500 }, () => {
    seen = printLines(readFileSync(logFile, "utf-8"), seen);
  });
}
