#!/usr/bin/env node
// scripts/wait.js  –  Wait for conditions
//
// Usage:
//   ./scripts/wait.js 'div.loaded'               # wait for selector (30s default)
//   ./scripts/wait.js 'div.loaded' --timeout 10   # custom timeout (seconds)
//   ./scripts/wait.js --idle                       # wait for network idle
//   ./scripts/wait.js --load                       # wait for load event

import { connect, invokePageFn, listTargets, printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @param {string} name
 * @param {string | undefined} value
 * @returns {number}
 */
const parsePositiveFloat = (name, value) => {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
};

/**
 * @param {string} targetSelector
 */
const selectorExistsFn = (targetSelector) =>
  !!document.querySelector(targetSelector);

const args = process.argv.slice(2);
const selector = args.find((a) => !a.startsWith("--"));
const waitIdle = args.includes("--idle");
const waitLoad = args.includes("--load");
const tIdx = args.indexOf("--timeout");
const timeoutSec =
  tIdx !== -1 ? parsePositiveFloat("--timeout", args[tIdx + 1]) : 30;

if (!selector && !waitIdle && !waitLoad) {
  console.error(
    "Usage: wait.js '<selector>' | wait.js --idle | wait.js --load",
  );
  process.exit(1);
}

let client;

try {
  const targets = await listTargets();
  if (targets.length === 0) {
    console.error("No open tabs.");
    process.exit(1);
  }
  client = await connect(targets[0].id);

  if (waitLoad) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Load timed out")),
        timeoutSec * 1000,
      );
      client.Page.loadEventFired(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    console.log("✔ Page load event fired");
  } else if (waitIdle) {
    // Wait until no network requests are in-flight for 500ms
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Network idle timed out")),
        timeoutSec * 1000,
      );
      let inflight = 0;
      let idleTimer = null;

      client.Network.requestWillBeSent(() => {
        inflight++;
        if (idleTimer) clearTimeout(idleTimer);
      });
      client.Network.loadingFinished(() => check());
      client.Network.loadingFailed(() => check());

      function check() {
        inflight = Math.max(0, inflight - 1);
        if (inflight === 0) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            clearTimeout(timer);
            resolve();
          }, 500);
        }
      }

      // Also resolve immediately if nothing happens for 500ms from the start
      idleTimer = setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 500);
    });
    console.log("✔ Network idle");
  } else {
    // Poll for selector
    const start = Date.now();
    while (Date.now() - start < timeoutSec * 1000) {
      const exists = await invokePageFn(client, selectorExistsFn, selector);
      if (exists === true) {
        console.log(`✔ Found: ${selector}`);
        process.exit(0);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.error(`✘ Timed out waiting for: ${selector}`);
    process.exit(1);
  }
} catch (err) {
  console.error("wait failed:", err.message);
  process.exit(1);
} finally {
  if (client) {
    await client.close().catch(() => {
      /* best effort */
    });
  }
}
