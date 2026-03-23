#!/usr/bin/env node
// scripts/nav.js  –  Navigate to a URL
//
// Usage:
//   ./scripts/nav.js https://example.com          # navigate current tab
//   ./scripts/nav.js https://example.com --new     # open in new tab
//   ./scripts/nav.js https://example.com --wait 5  # extra wait (seconds) after load

import {
  connect,
  invokePageFn,
  listTargets,
  waitForLoad,
  printHelp,
} from "./lib.js";
import CDP from "chrome-remote-interface";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @param {string} name
 * @param {string | undefined} value
 * @returns {number}
 */
const parseNonNegativeInt = (name, value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
};

const currentUrlFn = () => window.location.href;

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
if (!url) {
  console.error("Usage: nav.js <url> [--new] [--wait <seconds>]");
  process.exit(1);
}

const openNew = args.includes("--new");
const waitIdx = args.indexOf("--wait");
const extraWaitSec =
  waitIdx !== -1 ? parseNonNegativeInt("--wait", args[waitIdx + 1]) : 0;
const extraWait = extraWaitSec * 1000;
const port = parseInt(process.env.CDP_PORT || "9222", 10);

let client;

try {
  if (openNew) {
    // Ask the browser to create a new blank target, then navigate it
    const { id } = await CDP.New({ port, url: "about:blank" });
    client = await connect(id);
  } else {
    const targets = await listTargets();
    if (targets.length === 0) {
      console.error("No open tabs. Use --new to create one.");
      process.exit(1);
    }
    client = await connect(targets[0].id);
  }

  const loadPromise = waitForLoad(client);
  await client.Page.navigate({ url });
  await loadPromise;

  if (extraWait > 0) await new Promise((r) => setTimeout(r, extraWait));

  // Print final URL (may differ from input due to redirects)
  const finalUrl = await invokePageFn(client, currentUrlFn);
  console.log(`✔ ${finalUrl}`);
} catch (err) {
  console.error("Navigation failed:", err.message);
  process.exit(1);
} finally {
  if (client) {
    await client.close().catch(() => {
      /* best effort */
    });
  }
}
