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
import { arg, args } from "./utils";

const inputFile = arg("--input");
const outputFile = arg("--output");
const typeNames = args("--type");

function typeNestingDepth(call: CallExpression): number {
  let depth = 0;
  let node = call.getParent();
  while (node) {
    if (
      node.getKind() === SyntaxKind.CallExpression &&
      (node as CallExpression).getExpression().getText().startsWith("Type.")
    )
      depth++;
    node = node.getParent();
  }
  return depth;
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

type Location = { start: number; end: number };
type Replacement = { from: string; to: string };
type ReplacementEntry = {
  text: string;
  locations: Location[];
  replacement: Replacement;
  comment?: string;
};
type DedupSpecMeta = {
  names?: Set<string>;
};
type DedupSpec = {
  expression: string;
  replacementPrefix: string;
  depth?: number;
  getMeta?: (call: CallExpression) => DedupSpecMeta | undefined;
  buildComment?: (text: string, meta: DedupSpecMeta) => string | undefined;
};

function collectEntries(
  source: ReturnType<Project["createSourceFile"]>,
  spec: DedupSpec,
): ReplacementEntry[] {
  type Group = { locations: Location[]; meta?: DedupSpecMeta };
  const groups = new Map<string, Group>();

  const calls = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === spec.expression)
    .filter(
      (call) =>
        spec.depth === undefined || typeNestingDepth(call) === spec.depth,
    );

  for (const call of calls) {
    const location = { start: call.getStart(), end: call.getEnd() };

    const text = call.getText();
    if (!groups.has(text)) {
      groups.set(text, { locations: [], meta: spec.getMeta?.(call) });
    }

    const group = groups.get(text)!;
    group.locations.push(location);

    const meta = spec.getMeta?.(call);
    if (meta?.names) {
      if (!group.meta) group.meta = { names: new Set() };
      if (!group.meta.names) group.meta.names = new Set();
      for (const name of meta.names) group.meta.names.add(name);
    }
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.locations.length > 1)
    .map(([text, group], index) => ({
      text,
      locations: group.locations,
      replacement: { from: text, to: `${spec.replacementPrefix}${index}` },
      comment: group.meta ? spec.buildComment?.(text, group.meta) : undefined,
    }));
}

function deduplicate(content: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("schema.ts", content);

  const specs: DedupSpec[] = [
    {
      expression: "Type.Object",
      replacementPrefix: "_obj",
      depth: 2,
      getMeta: (call) => {
        const modelName = extractPropertyAssignment(call.getParent());
        return modelName ? { names: new Set([modelName]) } : undefined;
      },
      buildComment: (_text, meta) => {
        if (!meta.names || meta.names.size === 0) return undefined;
        return `/** ${meta.names.size} duplicates: ${Array.from(
          meta.names,
        ).join(", ")} */`;
      },
    },
    {
      expression: "Type.Literal",
      replacementPrefix: "_lit",
      depth: 2,
    },
  ];

  const entries: ReplacementEntry[] = [];
  for (const spec of specs) entries.push(...collectEntries(source, spec));

  if (entries.length === 0) {
    const [, ...lines] = content.split("\n");
    return lines.join("\n");
  }

  // Ignore the first line (assumed to be the import line)
  const [_, ...lines] = entries
    .flatMap(({ locations, replacement }) => {
      return locations.map((location) => ({ location, replacement }));
    })
    .sort((a, b) => b.location.start - a.location.start)
    .reduce((acc, { location: { start, end }, replacement: { to } }) => {
      return acc.slice(0, start) + to + acc.slice(end);
    }, content)
    .split("\n");

  let index = 0;
  for (const { replacement, comment } of entries) {
    const declaration = `const ${replacement.to} = ${replacement.from};`;
    lines.splice(
      index,
      0,
      comment ? `${comment}\n${declaration}` : declaration,
    );
    index++;
  }

  return lines.join("\n");
}

function resolveAliasText(type: Type, contextNode: Node): string {
  // Follow the alias symbol to its actual declaration
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
