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

function arg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`Missing required argument: ${flag}`);
    process.exit(1);
  }
  return process.argv[idx + 1];
}

const inputFile = arg("--input");
const typeName = arg("--type");
const outputFile = arg("--output");

function nestingDepth(call: CallExpression): number {
  let d = 0;
  let node = call.getParent();
  while (node) {
    if (
      node.getKind() === SyntaxKind.CallExpression &&
      (node as CallExpression).getExpression().getText() === "Type.Object"
    )
      d++;
    node = node.getParent();
  }
  return d;
}

const extractPropertyAssignment = (node?: Node<ts.Node>) => {
  if (node?.getKind() !== SyntaxKind.PropertyAssignment) return null;
  const key = node
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getNameNode()
    .getText();
  if (!key.startsWith('"') || !key.endsWith('"')) return null;
  return JSON.parse(key);
};

function deduplicatePass(content: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("schema.ts", content);

  const modelOptions = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "Type.Object")
    .filter((c) => nestingDepth(c) === 2);

  type Location = { start: number; end: number };
  type DupeGroup = { locations: Location[]; names: Set<string> };
  const duplicatesByText = new Map<string, DupeGroup>();

  for (const call of modelOptions) {
    const text = call.getText();
    if (!duplicatesByText.has(text))
      duplicatesByText.set(text, {
        locations: [],
        names: new Set(),
      });
    const group = duplicatesByText.get(text)!;

    group.locations.push({ start: call.getStart(), end: call.getEnd() });

    const modelName = extractPropertyAssignment(call.getParent());
    if (modelName) group.names.add(modelName);
  }

  const entries = Array.from(duplicatesByText.entries()).filter(
    ([, { locations }]) => locations.length > 1,
  );

  type Replacement = { from: string; to: string };
  const replacementByText = new Map<string, Replacement>(
    entries.map(([text], index) => [text, { from: text, to: `_${index}` }]),
  );

  const [importLine, ...lines] = entries
    .flatMap(([text, { locations }]) => {
      const replacement = replacementByText.get(text)!;
      return locations.map((location) => ({ location, replacement }));
    })
    .sort((a, b) => b.location.start - a.location.start)
    .reduce((acc, { location: { start, end }, replacement: { to } }) => {
      return acc.slice(0, start) + to + acc.slice(end);
    }, content)
    .split("\n");

  let index = 0;
  for (const { from, to } of replacementByText.values()) {
    const duplicate = duplicatesByText.get(from)!;
    const comment = `/** ${duplicate.names.size} duplicates: ${Array.from(
      duplicate.names,
    ).join(", ")} */`;

    lines.splice(index, 0, `const ${to} = ${from};\n\n` + comment);
    index++;
  }

  return importLine.replace("Static", "type Static") + "\n" + lines.join("\n");
}

/** hi */
function resolveAliasText(type: Type, contextNode: Node): string {
  // Follow the alias symbol to its actual declaration
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  const decl = symbol
    ?.getDeclarations()
    .find((d) => d.getKind() === ts.SyntaxKind.TypeAliasDeclaration);

  if (decl) {
    // decl is the `type AnthropicEffort = "default" | "turbo"` node
    return decl.getType().getText(decl);
  }

  // Fallback: return whatever getText gives
  return type.getText(contextNode);
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

function main() {
  const absInput = path.resolve(inputFile);
  if (!fs.existsSync(absInput)) {
    console.error(`Input file not found: ${absInput}`);
    process.exit(1);
  }

  console.log(`📖  Reading:   ${absInput}`);
  console.log(`🔎  Type:      ${typeName}`);

  const tsConfigFilePath = findTsConfig(absInput);
  if (tsConfigFilePath) {
    console.log(`⚙️   tsconfig:  ${tsConfigFilePath}`);
  }

  const project = new Project({
    ...(tsConfigFilePath
      ? { tsConfigFilePath }
      : { compilerOptions: { strict: true } }),
  });
  const sourceFile = project.addSourceFileAtPath(absInput);
  project.resolveSourceFileDependencies();

  const typeAlias = sourceFile.getTypeAliasOrThrow(typeName);
  let text = typeAlias.getType().getText(typeAlias);

  for (const { type, queries } of typesToResolve) {
    const aliasType = sourceFile.getTypeAliasOrThrow(type).getType();
    const resolved = resolveAliasText(
      aliasType,
      sourceFile.getTypeAliasOrThrow(type),
    );
    for (const query of queries) text = text.replace(query, resolved);
  }

  const code = `export type ${typeName} = ${text}`;

  const output = `
// AUTO-GENERATED — do not edit by hand.
// Source: ${path.relative(path.dirname(path.resolve(outputFile)), absInput)}
// Run: npx ts-node typebox-codegen.ts --input ... --type ${typeName} --output ...

${deduplicatePass(Codegen.TypeScriptToTypeBox.Generate(code).trim())}
  `;

  const absOutput = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, output, "utf8");

  console.log(`🎉  Written to: ${absOutput}`);
}

main();
