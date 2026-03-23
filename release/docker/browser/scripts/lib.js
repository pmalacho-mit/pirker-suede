// scripts/lib.js  –  shared CDP helpers
import CDP from "chrome-remote-interface";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const CDP_PORT = parseInt(process.env.CDP_PORT || "9222", 10);

/**
 * Connect to the first (or a specific) browser target.
 * Returns { client, Runtime, Page, DOM, Network, ... }
 */
export async function connect(targetId) {
  const opts = { port: CDP_PORT };
  if (targetId) opts.target = targetId;

  const client = await CDP(opts);
  await Promise.all([
    client.Runtime.enable(),
    client.Page.enable(),
    client.DOM.enable(),
    client.Network.enable(),
  ]);
  return client;
}

/**
 * List all page targets.
 */
export async function listTargets() {
  const targets = await CDP.List({ port: CDP_PORT });
  return targets.filter((t) => t.type === "page");
}

/**
 * Evaluate an expression in the runtime of the connected client.
 * Handles both sync and async expressions.
 * @param {CDP.Client} client
 * @param {string} expression
 */
export async function evaluate(client, expression) {
  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (exceptionDetails) {
    const msg =
      exceptionDetails.exception?.description ||
      exceptionDetails.text ||
      "Unknown error";
    throw new Error(msg);
  }
  return result.value;
}

/**
 * Invoke a serializable function in the page context with JSON-serializable args.
 * @template T
 * @param {CDP.Client} client
 * @param {( ...args: any[] ) => T} fn
 * @param {...any} args
 * @returns {Promise<T>}
 */
export async function invokePageFn(client, fn, ...args) {
  const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(", ");
  const expression = `(${fn.toString()})(${serializedArgs})`;
  return evaluate(client, expression);
}

/**
 * Invoke a page function that returns JSON.stringify(...) and parse it.
 * @template T
 * @param {CDP.Client} client
 * @param {( ...args: any[] ) => string} fn
 * @param {...any} args
 * @returns {Promise<T>}
 */
export async function invokePageJson(client, fn, ...args) {
  const raw = await invokePageFn(client, fn, ...args);
  if (typeof raw !== "string")
    throw new Error("Expected JSON string from page function");
  return JSON.parse(raw);
}

/**
 * Wait for a Page.loadEventFired (with timeout).
 * @param {CDP.Client} client
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<void>}
 */
export function waitForLoad(client, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Page load timed out")),
      timeoutMs,
    );
    client.Page.loadEventFired(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Print the usage documentation from the top of a script file and exit.
 * Extracts and prints all comment lines at the beginning of the file (after shebang).
 * @param {string} scriptPath - Path to the script file (use import.meta.url if in ES module)
 * @returns {never}
 */
export function printHelp(scriptPath) {
  const filePath = scriptPath.startsWith("file://")
    ? fileURLToPath(scriptPath)
    : scriptPath;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Extract comment block from the top (skip shebang)
  let helpText = [];
  let startIdx = lines[0]?.startsWith("#!") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("//")) {
      // Remove leading // and spaces
      helpText.push(line.replace(/^\/\/\s?/, ""));
    } else if (line.trim() === "") {
      // Allow blank comment lines
      helpText.push("");
    } else {
      // Stop at first non-comment line
      break;
    }
  }

  console.log(helpText.join("\n"));
  process.exit(0);
}
