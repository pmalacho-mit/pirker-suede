#!/usr/bin/env node
// scripts/eval.js  –  Evaluate JavaScript in the active tab
//
// Usage:
//   ./scripts/eval.js 'document.title'
//   ./scripts/eval.js 'await fetch("/api/status").then(r => r.json())'
//   echo 'document.title' | ./scripts/eval.js --stdin
//
// The expression runs inside an async context so `await` works.

import { connect, listTargets, printHelp } from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

const args = process.argv.slice(2);
let expression;

if (args.includes("--stdin")) {
  // Read expression from stdin (useful for complex scripts)
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  expression = Buffer.concat(chunks).toString("utf-8").trim();
} else expression = args.filter((a) => !a.startsWith("--")).join(" ");

if (!expression) {
  console.error("Usage: eval.js '<expression>' | eval.js --stdin");
  process.exit(1);
}

// --target <id> to pick a specific tab
const tIdx = args.indexOf("--target");
const targetId = tIdx !== -1 ? args[tIdx + 1] : undefined;

try {
  let client;
  if (targetId) client = await connect(targetId);
  else {
    const targets = await listTargets();
    if (targets.length === 0) {
      console.error("No open tabs.");
      process.exit(1);
    }
    client = await connect(targets[0].id);
  }

  // Wrap in an async IIFE so `await` works at the top level
  const wrapped = `(async () => { return (${expression}); })()`;

  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression: wrapped,
    awaitPromise: true,
    returnByValue: true,
  });

  if (exceptionDetails) {
    const msg =
      exceptionDetails.exception?.description ||
      exceptionDetails.text ||
      "Evaluation error";
    console.error("Error:", msg);
    process.exit(1);
  }

  // Pretty-print objects, raw-print primitives
  const val = result.value;
  if (typeof val === "object" && val !== null)
    console.log(JSON.stringify(val, null, 2));
  else if (val !== undefined) console.log(val);

  await client.close();
} catch (err) {
  console.error("eval failed:", err.message);
  process.exit(1);
}
