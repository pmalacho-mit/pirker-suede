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
import { CallExpression, Node, Project, SyntaxKind, Type, ts } from "ts-morph";
import { escape } from "../api/utils/regex";
import { arg, args } from "./utils/index.js";

const inputFile = arg("--input");
const typeNames = args("--type");
const outputFile = arg("--output");

// ---------------------------------------------------------------------------
// ts-morph helpers
// ---------------------------------------------------------------------------

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
 * If `call` is immediately used as the value of a quoted property assignment,
 * returns the unquoted key string; otherwise returns null.
 *
 * e.g.  "claude-3-haiku": Type.Object({...})
 *        ^^^^^^^^^^^^^^^^  → "claude-3-haiku"
 */
function getPropKeyForCall(call: CallExpression): string | null {
  const parent = call.getParent();
  if (parent?.getKind() !== SyntaxKind.PropertyAssignment) return null;
  const key = parent
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getNameNode()
    .getText();
  if (!key.startsWith('"') || !key.endsWith('"')) return null;
  return JSON.parse(key);
}

// ---------------------------------------------------------------------------
// Deduplication data structures
// ---------------------------------------------------------------------------

/**
 * All the information we need about one duplicate group, computed once from
 * the ts-morph AST.
 */
interface DupeGroup {
  /** The shared verbatim text of every occurrence. */
  origText: string;
  typeMethod: string;
  /** Every occurrence in the body, with absolute positions and optional propKey. */
  spans: Array<{ start: number; end: number; propKey?: string }>;
  /**
   * Positions of *direct-child* duplicate groups within this group's
   * representative (first) occurrence, expressed relative to that occurrence's
   * `start`.  Used by evolveText so it never has to re-parse anything.
   */
  directChildSlots: Array<{ start: number; end: number; origText: string }>;
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

const varPrefixByType = new Map<string, string>();
const varIndexByType = new Map<string, number>();

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

// ---------------------------------------------------------------------------
// Core: single ts-morph parse → duplicate groups in topo order
// ---------------------------------------------------------------------------

/**
 * Parse `body` once with ts-morph and return all duplicate nested Type.*
 * call groups in topological order (inner groups first).
 *
 * Also pre-computes `directChildSlots` for each group so that evolveText
 * can produce the declaration body with zero additional parsing.
 */
function buildDupeGroups(body: string): DupeGroup[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("schema.ts", body);

  // ── Collect every nested Type.* call span ────────────────────────────
  interface RawSpan {
    start: number;
    end: number;
    text: string;
    typeMethod: string;
    propKey?: string;
  }

  const rawSpans: RawSpan[] = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => /^Type\./.test(call.getExpression().getText()))
    .filter((call) => computeTypeCallDepth(call) > 0)
    .map((call) => {
      const typeMethod = call
        .getExpression()
        .getText()
        .replace(/^Type\./, "");
      return {
        start: call.getStart(),
        end: call.getEnd(),
        text: call.getText(),
        typeMethod,
        propKey:
          typeMethod === "Object"
            ? getPropKeyForCall(call) ?? undefined
            : undefined,
      };
    });

  // ── Group by verbatim text; keep only duplicates ─────────────────────
  const byText = new Map<string, RawSpan[]>();
  for (const s of rawSpans) {
    const bucket = byText.get(s.text);
    if (bucket) bucket.push(s);
    else byText.set(s.text, [s]);
  }

  const rawGroups = [...byText.values()].filter((g) => g.length > 1);
  if (rawGroups.length === 0) return [];

  const n = rawGroups.length;

  // ── Build containment edges via O(n log n) interval sweep ────────────
  //
  // outEdges[inner_gi] = Set<outer_gi>
  // Means: group `inner_gi` is contained within group `outer_gi`, so inner
  // must be processed (extracted) before outer.

  const flat = rawGroups.flatMap((g, gi) =>
    g.map((s) => ({ start: s.start, end: s.end, gi })),
  );
  flat.sort((a, b) =>
    a.start !== b.start ? a.start - b.start : b.end - a.end,
  );

  const outEdges: Set<number>[] = Array.from({ length: n }, () => new Set());
  const inDegree = new Array<number>(n).fill(0);
  const sweepStack: Array<{ end: number; gi: number }> = [];

  for (const span of flat) {
    while (
      sweepStack.length > 0 &&
      sweepStack[sweepStack.length - 1].end <= span.start
    )
      sweepStack.pop();

    for (const open of sweepStack) {
      if (open.gi !== span.gi && !outEdges[span.gi].has(open.gi)) {
        outEdges[span.gi].add(open.gi);
        inDegree[open.gi]++;
      }
    }
    sweepStack.push({ end: span.end, gi: span.gi });
  }

  // ── Topological sort (Kahn's algorithm) ──────────────────────────────
  const topoOrder: number[] = [];
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue.push(i);

  let head = 0;
  while (head < queue.length) {
    const gi = queue[head++];
    topoOrder.push(gi);
    for (const next of outEdges[gi]) {
      if (--inDegree[next] === 0) queue.push(next);
    }
  }

  // ── Compute direct children for each group ───────────────────────────
  //
  // containedBy[outer_gi] = Set<inner_gi> (all groups inside outer, direct or not)
  // directChildren[outer_gi] = immediate children only (no group Z with inner ⊂ Z ⊂ outer)
  //
  // A child X of outer G is *direct* when no other group Z satisfies X ⊂ Z ⊂ G.
  // Equivalently: X is not in containedBy[Z] for any Z that is itself in containedBy[G].

  const containedBy: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let inner = 0; inner < n; inner++) {
    for (const outer of outEdges[inner]) containedBy[outer].add(inner);
  }

  const directChildren: Set<number>[] = Array.from(
    { length: n },
    () => new Set(),
  );
  for (let outer = 0; outer < n; outer++) {
    for (const inner of containedBy[outer]) {
      // inner is a direct child iff no intermediary Z ∈ containedBy[outer] contains it
      const isDirect = !Array.from(containedBy[outer]).some(
        (z) => z !== inner && containedBy[z].has(inner),
      );
      if (isDirect) directChildren[outer].add(inner);
    }
  }

  // ── Assemble DupGroup records in topo order ───────────────────────────
  return topoOrder.map((gi) => {
    const group = rawGroups[gi];
    const repSpan = group[0]; // representative occurrence

    // For each direct child group, find ALL its occurrences that sit inside
    // the representative span and record their relative positions.
    const directChildSlots = Array.from(directChildren[gi]).flatMap((childGi) =>
      rawGroups[childGi]
        .filter((s) => s.start >= repSpan.start && s.end <= repSpan.end)
        .map((s) => ({
          start: s.start - repSpan.start,
          end: s.end - repSpan.start,
          origText: rawGroups[childGi][0].text,
        })),
    );

    return {
      origText: repSpan.text,
      typeMethod: repSpan.typeMethod,
      spans: group.map((s) => ({
        start: s.start,
        end: s.end,
        propKey: s.propKey,
      })),
      directChildSlots,
    };
  });
}

// ---------------------------------------------------------------------------
// evolveText and comment helpers
// ---------------------------------------------------------------------------

/**
 * Compute the declaration body for a group by substituting the already-assigned
 * variable names of its direct children into the original span text.
 *
 * Uses pre-computed `directChildSlots` — no re-parsing required.
 * Applies substitutions right-to-left so earlier positions remain valid.
 */
function evolveText(
  origText: string,
  directChildSlots: DupeGroup["directChildSlots"],
  assignedVars: Map<string, string>,
): string {
  if (directChildSlots.length === 0) return origText;

  const sorted = [...directChildSlots].sort((a, b) => b.start - a.start);

  let result = origText;
  for (const slot of sorted) {
    const varName = assignedVars.get(slot.origText);
    if (!varName) continue; // shouldn't happen in topo order, but guard anyway
    result = result.slice(0, slot.start) + varName + result.slice(slot.end);
  }
  return result;
}

function buildObjectComment(group: DupeGroup): string | undefined {
  const names = group.spans
    .map((s) => s.propKey)
    .filter((k): k is string => k !== undefined);
  if (names.length === 0) return undefined;
  return `/** ${group.spans.length} duplicates: ${names.join(", ")} */`;
}

// ---------------------------------------------------------------------------
// Deduplication entry point
// ---------------------------------------------------------------------------

/**
 * Fully deduplicate a generated TypeBox source string.
 *
 * Algorithm:
 *  1. Parse the body once with ts-morph to locate all nested Type.* call spans.
 *  2. Group identical spans; filter to those with > 1 occurrence.
 *  3. Build a containment DAG via an O(n log n) interval sweep and topologically
 *     sort it (inner groups first) with Kahn's algorithm.
 *  4. Pre-compute direct-child slots (relative byte positions of each group's
 *     immediate children within its representative span text).
 *  5. Process groups in topo order:
 *       a. Evolve the declaration text by substituting direct-child var names
 *          into the representative span text at their pre-computed positions.
 *       b. Assign a variable name; record the `const` declaration.
 *       c. Replace all occurrences in the body with split/join — safe because
 *          TypeBox codegen never embeds `Type.*` syntax inside string literals.
 */
function deduplicate(content: string): string {
  // Drop the `import { Type, … }` line emitted by Codegen; the caller
  // already wrote the canonical import.
  const [, ...bodyLines] = content.split("\n");
  let body = bodyLines.join("\n");

  const dupGroups = buildDupeGroups(body);
  if (dupGroups.length === 0) return body;

  const declarations: string[] = [];
  const assignedVars = new Map<string, string>(); // origText → varName

  for (const group of dupGroups) {
    const declText = evolveText(
      group.origText,
      group.directChildSlots,
      assignedVars,
    );
    const varName = getVarNameForType(group.origText);
    assignedVars.set(group.origText, varName);

    const comment =
      group.typeMethod === "Object" ? buildObjectComment(group) : undefined;
    declarations.push(
      comment
        ? `${comment}\nconst ${varName} = ${declText};`
        : `const ${varName} = ${declText};`,
    );

    body = body.split(declText).join(varName);
  }

  return declarations.join("\n") + "\n" + body;
}

// ---------------------------------------------------------------------------
// Type resolution helpers (ts-morph used on the input file, separately)
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
    `import { Type, type Static } from "@sinclair/typebox";`,
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
