#!/usr/bin/env node
/**
 * typebox-codegen.ts
 *
 * Build-step script: reads a TypeScript source file, resolves a named type,
 * and emits a TypeBox schema definition to an output file.
 *
 * Usage:
 *   npx ts-node typebox-codegen.ts \
 *     --input  ./src/my-types.ts  \
 *     --type   MyRecord           \
 *     --output ./src/my-schema.ts
 *
 * Supported value domain:
 *   string | number | undefined | { ... } and unions thereof.
 *   Optional fields (T | undefined) are emitted as Type.Optional(T).
 */

import * as path from "path";
import * as fs from "fs";
import * as Codegen from "@sinclair/typebox-codegen";
import { Project, ts, Type, Node, SyntaxKind, CallExpression } from "ts-morph";
import { escape } from "../api/utils/regex";
import { arg, args } from "./utils/index.js";

const inputFile = arg("--input");
const typeNames = args("--type");
const outputFile = arg("--output");

const extractPropertyAssignment = (node?: Node<ts.Node>) => {
  if (node?.getKind() !== SyntaxKind.PropertyAssignment) return null;
  const key = node
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getNameNode()
    .getText();
  if (!key.startsWith('"') || !key.endsWith('"')) return null;
  return JSON.parse(key);
};

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

const varPrefixByType = new Map<string, string>();
const varIndexByType = new Map<string, number>();

/** Maps a Type.Xyz expression to a short variable-name prefix like "_obj". */
function getVarNameForType(expressionText: string): string {
  const match = expressionText.match(/^Type\.(\w+)/);
  const typeName = (match?.[1] ?? "Expr").toLowerCase();
  if (!varPrefixByType.has(typeName)) {
    const existing = new Set(varPrefixByType.values());
    let take = 3;
    let attempt = typeName.slice(0, take);
    while (existing.has(attempt) && take < typeName.length) {
      take++;
      attempt = typeName.slice(0, take);
    }
    varPrefixByType.set(typeName, attempt);
  }
  const index = (varIndexByType.get(typeName) ?? -1) + 1;
  varIndexByType.set(typeName, index);
  return `_${varPrefixByType.get(typeName)}${index}`;
}

/** How many Type.* call-expression ancestors does this node have? */
function computeTypeCallDepth(call: CallExpression): number {
  let depth = 0;
  let node: Node | undefined = call.getParent();
  while (node) {
    if (
      node.getKind() === SyntaxKind.CallExpression &&
      /^Type\./.test((node as CallExpression).getExpression().getText())
    )
      depth++;
    node = node.getParent();
  }
  return depth;
}

/**
 * For Type.Object duplicates, collect the quoted property-key names that
 * point to this schema so the comment is human-readable.
 */
function buildObjectComment(calls: CallExpression[]): string | undefined {
  const names: string[] = [];
  for (const call of calls) {
    const key = extractPropertyAssignment(call.getParent());
    if (key) names.push(key);
  }
  if (names.length === 0) return undefined;
  return `/** ${calls.length} duplicates: ${names.join(", ")} */`;
}

// A string that will never appear in generated TypeBox code; used as a
// stable anchor separating the growing declarations block from the export.
const EXTRACT_MARKER = "// @extract-start\n";

/**
 * Fully deduplicate a generated TypeBox source string.
 *
 * Strategy (multi-pass, leaf-first):
 *
 * Each pass:
 *   1. Parse the current body.
 *   2. Find every nested Type.* call expression that appears more than once
 *      inside the export body (positions after EXTRACT_MARKER).
 *   3. Keep only the "leaf" duplicate groups – those whose occurrences don't
 *      contain any other duplicate expression inside them.  This prevents
 *      index corruption when two nested expressions are both duplicates.
 *   4. Assign variable names, apply right-to-left string replacements.
 *   5. Insert the new `const` declarations just before EXTRACT_MARKER so
 *      dependency order is always correct (inner things first, outer last).
 *
 * After O(depth) passes the export body references only variable names and
 * no further duplicates exist.
 */
function deduplicate(content: string): string {
  // Drop the `import { Type, … }` line emitted by Codegen; the caller
  // already wrote the canonical import.
  const [, ...bodyLines] = content.split("\n");

  // body layout:  <declarations>  EXTRACT_MARKER  <export statement>
  let body = EXTRACT_MARKER + bodyLines.join("\n");

  type CallInfo = {
    call: CallExpression;
    text: string;
    start: number;
    end: number;
  };

  const MAX_PASSES = 10;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const markerIdx = body.indexOf(EXTRACT_MARKER);
    const exportStart = markerIdx + EXTRACT_MARKER.length;

    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("schema.ts", body);

    // Only examine calls that live inside the export body (after the marker).
    // Calls inside already-extracted `const` declarations are left untouched;
    // their text stays valid and their position in the output is already correct.
    const nestedCalls: CallInfo[] = source
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getStart() >= exportStart)
      .filter((call) => /^Type\./.test(call.getExpression().getText()))
      .filter((call) => computeTypeCallDepth(call) > 0)
      .map((call) => ({
        call,
        text: call.getText(),
        start: call.getStart(),
        end: call.getEnd(),
      }));

    // Group by verbatim text; duplicates = groups with length > 1.
    const byText = new Map<string, CallInfo[]>();
    for (const item of nestedCalls) {
      if (!byText.has(item.text)) byText.set(item.text, []);
      byText.get(item.text)!.push(item);
    }

    const allDupGroups = [...byText.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([text, items]) => ({ text, items }));

    if (allDupGroups.length === 0) break; // fully deduplicated

    // Leaf groups: no item in the group contains an occurrence from another
    // duplicate group.  Extracting only leaves per pass keeps the string
    // indices consistent within a single pass.
    const leafGroups = allDupGroups.filter((group) =>
      group.items.every(
        (item) =>
          !allDupGroups.some(
            (other) =>
              other !== group &&
              other.items.some((o) => o.start > item.start && o.end < item.end),
          ),
      ),
    );

    // Safety valve: if somehow nothing is a leaf, break to avoid an
    // infinite loop (shouldn't happen in valid TypeBox output).
    if (leafGroups.length === 0) break;

    const textToVar = new Map<string, string>();
    const thisPassDecls: string[] = [];

    for (const { text, items } of leafGroups) {
      const varName = getVarNameForType(text);
      textToVar.set(text, varName);
      const comment = /^Type\.Object/.test(text)
        ? buildObjectComment(items.map((i) => i.call))
        : undefined;
      const decl = `const ${varName} = ${text};`;
      thisPassDecls.push(comment ? `${comment}\n${decl}` : decl);
    }

    // Apply replacements right-to-left so earlier positions stay valid.
    const replacements = leafGroups
      .flatMap(({ text, items }) =>
        items.map((item) => ({
          start: item.start,
          end: item.end,
          to: textToVar.get(text)!,
        })),
      )
      .sort((a, b) => b.start - a.start);

    let newBody = body;
    for (const { start, end, to } of replacements) {
      newBody = newBody.slice(0, start) + to + newBody.slice(end);
    }

    // Insert this pass's declarations just before the marker.
    // Because we prepend each new pass before the marker, and each pass's
    // expressions depend on the *previous* pass's variables (which are
    // already above the marker), the final declaration order is:
    //   pass-0 decls  →  pass-1 decls  →  …  →  pass-N decls  →  MARKER  →  export
    // i.e. always correct dependency order.
    const newMarkerIdx = newBody.indexOf(EXTRACT_MARKER);
    newBody =
      newBody.slice(0, newMarkerIdx) +
      thisPassDecls.join("\n") +
      "\n" +
      newBody.slice(newMarkerIdx);

    body = newBody;
    console.log(
      `    pass ${pass + 1}: extracted ${
        leafGroups.length
      } unique expression(s)`,
    );
  }

  // Strip the marker; everything before it becomes the declarations preamble.
  return body.replace(EXTRACT_MARKER, "");
}

// ---------------------------------------------------------------------------
// Type resolution helpers (unchanged from original)
// ---------------------------------------------------------------------------

function resolveAliasText(type: Type, contextNode: Node): string {
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  const declaration = symbol
    ?.getDeclarations()
    .find((d) => d.getKind() === ts.SyntaxKind.TypeAliasDeclaration);
  return (
    declaration?.getType().getText(declaration) ?? type.getText(contextNode)
  );
}

function findTsConfig(fromFile: string): string | undefined {
  let dir = path.dirname(fromFile);
  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const typesToResolve = [
  "AnthropicEffort",
  "Transport",
  "CacheRetention",
  "GoogleThinkingLevel",
  `ResponseCreateParamsStreaming["service_tier"]`,
  "ResponseCreateParamsStreaming",
].map((type) => ({
  type: type.split(/[[.]/)[0],
  queries: [
    new RegExp(`import\\("[^"]*"\\)\\.${escape(type)}`, "g"),
    new RegExp(`PI\\.${escape(type)}`, "g"),
  ],
}));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const absInput = path.resolve(inputFile);
  if (!fs.existsSync(absInput)) {
    console.error(`Input file not found: ${absInput}`);
    process.exit(1);
  }

  console.log(`📖  Reading:   ${absInput}`);
  console.log(`🔎  Types:     ${typeNames.join(", ")}`);

  const tsConfigFilePath = findTsConfig(absInput);
  if (tsConfigFilePath) console.log(`⚙️   tsconfig:  ${tsConfigFilePath}`);

  const project = new Project({
    ...(tsConfigFilePath
      ? { tsConfigFilePath }
      : { compilerOptions: { strict: true } }),
  });
  const sourceFile = project.addSourceFileAtPath(absInput);
  project.resolveSourceFileDependencies();

  const blocks: string[] = [
    "// AUTO-GENERATED — do not edit by hand.",
    `// Source: ${path.relative(
      path.dirname(path.resolve(outputFile)),
      absInput,
    )}`,
    `// Run: npx ts-node generate-model-details.ts --input ... --type ${typeNames.join(
      " --type ",
    )} --output ...`,
    "",
    `import { Type, type Static } from "@sinclair/typebox";`,
    "",
  ];

  const modifiers = new Array<(text: string) => string>();

  for (const { type, queries } of typesToResolve) {
    const aliasType = sourceFile.getTypeAliasOrThrow(type).getType();
    const resolved = resolveAliasText(
      aliasType,
      sourceFile.getTypeAliasOrThrow(type),
    );
    for (const query of queries)
      modifiers.push((text) => text.replace(query, resolved));
  }

  for (let i = 0; i < typeNames.length; i++) {
    const typeName = typeNames[i];

    console.log(`\n🛠️   Generating: ${typeName}`);

    const typeAlias = sourceFile.getTypeAliasOrThrow(typeName);
    let text = typeAlias.getType().getText(typeAlias);

    for (const modifier of modifiers) text = modifier(text);

    const code = `export type ${typeName} = ${text}`;
    blocks.push(deduplicate(Codegen.TypeScriptToTypeBox.Generate(code).trim()));
  }

  const absOutput = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, blocks.join("\n\n") + "\n", "utf8");

  console.log(`🎉  Written to: ${absOutput}`);
}

main();
