#!/usr/bin/env node
// scripts/tabs.js  –  Manage browser tabs
//
// Usage:
//   ./scripts/tabs.js                  # list all tabs
//   ./scripts/tabs.js --close <id>     # close a specific tab
//   ./scripts/tabs.js --close-all      # close all tabs except the first

import CDP from "chrome-remote-interface";
import { printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @typedef {{ id: string, type: string, title?: string, url?: string }} CdpTarget
 */

const port = parseInt(process.env.CDP_PORT || "9222", 10);
const args = process.argv.slice(2);

try {
  /** @type {CdpTarget[]} */
  const targets = (await CDP.List({ port })).filter((t) => t.type === "page");

  if (args.includes("--close-all")) {
    if (targets.length === 0) {
      console.log("No tabs to close.");
      process.exit(0);
    }

    // Keep the first tab, close the rest
    for (let i = 1; i < targets.length; i++) {
      await CDP.Close({ port, id: targets[i].id });
      console.log(`Closed: ${targets[i].title || targets[i].url}`);
    }
    const closed = Math.max(0, targets.length - 1);
    const remaining = targets.length > 0 ? 1 : 0;
    console.log(`\n${closed} tab(s) closed, ${remaining} remaining.`);
  } else if (args.includes("--close")) {
    const id = args[args.indexOf("--close") + 1];
    if (!id) {
      console.error("Usage: tabs.js --close <target-id>");
      process.exit(1);
    }
    await CDP.Close({ port, id });
    console.log(`Closed tab ${id}`);
  } else {
    // List
    console.log(`${targets.length} tab(s):\n`);
    for (const t of targets) {
      console.log(`  [${t.id}]`);
      console.log(`    Title: ${t.title || "(untitled)"}`);
      console.log(`    URL:   ${t.url}`);
      console.log();
    }
  }
} catch (err) {
  console.error("tabs failed:", err.message);
  process.exit(1);
}
