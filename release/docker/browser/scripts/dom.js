#!/usr/bin/env node
// scripts/dom.js  –  Inspect the page DOM
//
// Usage:
//   ./scripts/dom.js                             # outline of the full page
//   ./scripts/dom.js 'form'                      # show all <form> subtrees
//   ./scripts/dom.js --links                     # list all links
//   ./scripts/dom.js --inputs                    # list all input/button/select elements
//   ./scripts/dom.js --text 'main'               # extract visible text from <main>

import {
  connect,
  invokePageFn,
  invokePageJson,
  listTargets,
  printHelp,
} from "./lib.js";

if (process.argv.includes("--help")) printHelp(import.meta.url);

const args = process.argv.slice(2);
const showLinks = args.includes("--links");
const showInputs = args.includes("--inputs");
const textIdx = args.indexOf("--text");
const textSelector = textIdx !== -1 ? args[textIdx + 1] : null;
const selector = args.find((a) => !a.startsWith("--"));

/**
 * @typedef {{ text: string, href: string }} LinkInfo
 */
const showLinksFn = () => {
  /** @type {LinkInfo[]} */
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({
      text: a.textContent.trim().slice(0, 100),
      href: a.href,
    }))
    .filter((l) => l.text || l.href);

  return JSON.stringify(links);
};

/**
 * @typedef {{
 *   tag: string,
 *   type: string,
 *   name: string,
 *   id: string,
 *   placeholder: string,
 *   value: string,
 *   text: string,
 *   selector: string
 * }} InputInfo
 */
const showInputsFn = () => {
  /** @type {InputInfo[]} */
  const inputs = Array.from(
    document.querySelectorAll("input, button, select, textarea"),
  ).map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || "",
    name: el.name || "",
    id: el.id || "",
    placeholder: el.placeholder || "",
    value: el.value?.slice(0, 50) || "",
    text: el.textContent?.trim().slice(0, 50) || "",
    selector: el.id
      ? "#" + el.id
      : el.name
      ? el.tagName.toLowerCase() + '[name="' + el.name + '"]'
      : "",
  }));

  return JSON.stringify(inputs);
};

/**
 * @param {string} targetSelector
 */
const extractTextFn = (targetSelector) =>
  (document.querySelector(targetSelector) || document.body).innerText;

/**
 * @param {string} targetSelector
 */
const queryOuterHtmlFn = (targetSelector) => {
  const els = document.querySelectorAll(targetSelector);
  return Array.from(els)
    .map((el) => el.outerHTML.slice(0, 500))
    .join("\n---\n");
};

/**
 * @typedef {{ level: string, text: string }} HeadingInfo
 * @typedef {{
 *   title: string,
 *   url: string,
 *   headings: HeadingInfo[],
 *   forms: number,
 *   links: number,
 *   images: number,
 *   inputs: number
 * }} PageOutline
 */
const pageOutlineFn = () => {
  /** @type {PageOutline} */
  const outline = {
    title: document.title,
    url: location.href,
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => ({
      level: h.tagName,
      text: h.textContent.trim().slice(0, 120),
    })),
    forms: document.forms.length,
    links: document.links.length,
    images: document.images.length,
    inputs: document.querySelectorAll("input,button,select,textarea").length,
  };
  return JSON.stringify(outline);
};

try {
  const targets = await listTargets();
  if (targets.length === 0) {
    console.error("No open tabs.");
    process.exit(1);
  }
  const client = await connect(targets[0].id);

  if (showLinks) {
    /** @type {LinkInfo[]} */
    const links = await invokePageJson(client, showLinksFn);
    for (const l of links)
      console.log(`  ${l.text || "(empty)"}\n    → ${l.href}\n`);
    console.log(`${links.length} link(s)`);
  } else if (showInputs) {
    /** @type {InputInfo[]} */
    const inputs = await invokePageJson(client, showInputsFn);
    for (const inp of inputs) {
      const desc = [
        `<${inp.tag}`,
        inp.type ? ` type="${inp.type}"` : "",
        inp.name ? ` name="${inp.name}"` : "",
        inp.id ? ` id="${inp.id}"` : "",
        ">",
      ].join("");
      const hint = inp.placeholder || inp.text || inp.value || "";
      console.log(`  ${desc}${hint ? "  →  " + hint : ""}`);
      if (inp.selector) console.log(`    selector: ${inp.selector}`);
      console.log();
    }
    console.log(`${inputs.length} interactive element(s)`);
  } else if (textSelector) {
    const text = await invokePageFn(client, extractTextFn, textSelector);
    console.log(text);
  } else if (selector) {
    const html = await invokePageFn(client, queryOuterHtmlFn, selector);
    console.log(html || "(no matches)");
  } else {
    // Page outline: title, URL, headings, landmark counts
    /** @type {PageOutline} */
    const info = await invokePageJson(client, pageOutlineFn);
    console.log(`Title:   ${info.title}`);
    console.log(`URL:     ${info.url}`);
    console.log(
      `Links:   ${info.links}  |  Forms: ${info.forms}  |  Inputs: ${info.inputs}  |  Images: ${info.images}`,
    );
    if (info.headings.length > 0) {
      console.log(`\nHeadings:`);
      for (const h of info.headings) console.log(`  ${h.level}  ${h.text}`);
    }
  }

  await client.close();
} catch (err) {
  console.error("dom failed:", err.message);
  process.exit(1);
}
