#!/usr/bin/env node
// scripts/screenshot.js  –  Capture a screenshot
//
// Usage:
//   ./scripts/screenshot.js                         # viewport PNG to stdout path
//   ./scripts/screenshot.js --full                   # full-page screenshot
//   ./scripts/screenshot.js -o /tmp/shot.png         # custom output path
//   ./scripts/screenshot.js --format jpeg --quality 80

import { connect, invokePageJson, listTargets, printHelp } from "./lib.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.argv.includes("--help")) printHelp(import.meta.url);

/**
 * @typedef {{ w: number, h: number }} PageDimensions
 */

/**
 * @param {string | undefined} value
 * @returns {"png" | "jpeg" | "webp"}
 */
const parseFormat = (value) => {
  const format = /** @type {"png" | "jpeg" | "webp"} */ (value ?? "png");
  if (format !== "png" && format !== "jpeg" && format !== "webp") {
    throw new Error("--format must be one of: png, jpeg, webp");
  }
  return format;
};

/**
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
const parseQuality = (value) => {
  if (value === undefined) return undefined;
  const quality = Number.parseInt(value, 10);
  if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
    throw new Error("--quality must be an integer between 0 and 100");
  }
  return quality;
};

const fullPageDimensionsFn = () => {
  /** @type {PageDimensions} */
  const dimensions = {
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  };
  return JSON.stringify(dimensions);
};

const args = process.argv.slice(2);
const fullPage = args.includes("--full");

const fmtIdx = args.indexOf("--format");
const format = parseFormat(fmtIdx !== -1 ? args[fmtIdx + 1] : undefined);

const qIdx = args.indexOf("--quality");
const quality = parseQuality(qIdx !== -1 ? args[qIdx + 1] : undefined);

const oIdx = args.indexOf("-o");
let outPath = oIdx !== -1 ? args[oIdx + 1] : null;

// --target <id>
const tIdx = args.indexOf("--target");
const targetId = tIdx !== -1 ? args[tIdx + 1] : undefined;

let client;

try {
  if (targetId) {
    client = await connect(targetId);
  } else {
    const targets = await listTargets();
    if (targets.length === 0) {
      console.error("No open tabs.");
      process.exit(1);
    }
    client = await connect(targets[0].id);
  }

  // If full-page, get the full document dimensions and set the viewport
  if (fullPage) {
    /** @type {PageDimensions} */
    const { w, h } = await invokePageJson(client, fullPageDimensionsFn);
    await client.Emulation.setDeviceMetricsOverride({
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // small delay to let the layout settle
    await new Promise((r) => setTimeout(r, 300));
  }

  const captureOpts = { format };
  if (quality !== undefined) captureOpts.quality = quality;
  if (fullPage) captureOpts.captureBeyondViewport = true;

  const { data } = await client.Page.captureScreenshot(captureOpts);

  if (!outPath) {
    const dir = join(process.env.LOG_DIR || "/tmp/browser-logs", "screenshots");
    mkdirSync(dir, { recursive: true });
    outPath = join(dir, `screenshot-${Date.now()}.${format}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(data, "base64"));
  console.log(outPath);

  // Reset viewport override if we changed it
  if (fullPage) {
    await client.Emulation.clearDeviceMetricsOverride();
  }
} catch (err) {
  console.error("Screenshot failed:", err.message);
  process.exit(1);
} finally {
  if (client) {
    await client.close().catch(() => {
      /* best effort */
    });
  }
}
