#!/usr/bin/env node
// scripts/click.js  –  Click an element
//
// Usage:
//   ./scripts/click.js 'button.submit'                  # CSS selector
//   ./scripts/click.js --xy 500,300                      # raw coordinates
//   ./scripts/click.js 'a[href="/login"]' --wait 2       # click then wait 2s

import { connect, invokePageFn, listTargets, printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @typedef {{ x: number, y: number, tag: string, text: string }} ElementPoint
 */

/**
 * @param {string} xy
 * @returns {[number, number]}
 */
const parseXY = (xy) => {
  /** @type {[number, number]} */
  const parts = xy.split(",").map((p) => Number(p));
  if (
    parts.length !== 2 ||
    !Number.isFinite(parts[0]) ||
    !Number.isFinite(parts[1])
  )
    throw new Error("--xy must be in the form x,y with numeric values");
  return parts;
};

const args = process.argv.slice(2);
const selector = args.find((a) => !a.startsWith("--"));
const xyIdx = args.indexOf("--xy");
const xy = xyIdx !== -1 ? args[xyIdx + 1] : null;
const waitIdx = args.indexOf("--wait");
const waitSec = waitIdx !== -1 ? parseFloat(args[waitIdx + 1]) : 0;

if (!Number.isFinite(waitSec) || waitSec < 0) {
  console.error("--wait must be a non-negative number");
  process.exit(1);
}

if (!selector && !xy) {
  console.error("Usage: click.js '<css-selector>' | click.js --xy x,y");
  process.exit(1);
}

/**
 * @param {string} targetSelector
 */
const selectFn = (targetSelector) => {
  /** @type {HTMLElement | null} */
  const el = document.querySelector(targetSelector);
  if (!el) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  return {
    x: x + width / 2,
    y: y + height / 2,
    tag: el.tagName,
    text: el.textContent.trim().slice(0, 80),
  };
};

/** @type {import("chrome-remote-interface").Client | null} */
let client;

try {
  const targets = await listTargets();
  if (targets.length === 0) {
    console.error("No open tabs.");
    process.exit(1);
  }
  client = await connect(targets[0].id);

  /** @type {number} */
  let x;
  /** @type {number} */
  let y;

  if (xy) [x, y] = parseXY(xy);
  else {
    // Resolve selector to coordinates via JS
    const pointValue = await invokePageFn(client, selectFn, selector);

    if (!pointValue)
      throw new Error(`No element found for selector: ${selector}`);

    /** @type {ElementPoint} */
    const point = pointValue;

    ({ x, y } = point);
    console.log(`Target: <${point.tag.toLowerCase()}> "${point.text}"`);
  }

  // Dispatch mouse events via Input domain
  const clickOpts = { x, y, button: "left", clickCount: 1 };
  await client.Input.dispatchMouseEvent({ type: "mousePressed", ...clickOpts });
  await client.Input.dispatchMouseEvent({
    type: "mouseReleased",
    ...clickOpts,
  });

  console.log(`✔ Clicked at (${Math.round(x)}, ${Math.round(y)})`);

  if (waitSec > 0) await new Promise((r) => setTimeout(r, waitSec * 1000));
} catch (err) {
  console.error("click failed:", err.message);
  process.exit(1);
} finally {
  await client?.close().catch(() => {
    /* best effort */
  });
}
