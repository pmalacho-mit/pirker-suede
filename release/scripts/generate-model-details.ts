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

function args(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag) {
      const next = process.argv[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(`Missing required argument value for: ${flag}`);
        process.exit(1);
      }
      values.push(
        ...next
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }

  if (values.length === 0) {
    console.error(`Missing required argument: ${flag}`);
    process.exit(1);
  }

  return values;
}

const inputFile = arg("--input");
const typeNames = args("--type");
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
  minDepth?: number;
  shouldInclude?: (location: Location, selected: ReplacementEntry[]) => boolean;
  getMeta?: (call: CallExpression) => DedupSpecMeta | undefined;
  buildComment?: (text: string, meta: DedupSpecMeta) => string | undefined;
};

function isInsideAnyRange(location: Location, ranges: Location[]) {
  return ranges.some(
    (range) => location.start >= range.start && location.end <= range.end,
  );
}

function collectEntries(
  source: ReturnType<Project["createSourceFile"]>,
  spec: DedupSpec,
  selected: ReplacementEntry[],
): ReplacementEntry[] {
  type Group = { locations: Location[]; meta?: DedupSpecMeta };
  const groups = new Map<string, Group>();

  const calls = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === spec.expression)
    .filter((call) =>
      spec.minDepth !== undefined ? nestingDepth(call) === spec.minDepth : true,
    );

  for (const call of calls) {
    const location = { start: call.getStart(), end: call.getEnd() };
    if (spec.shouldInclude && !spec.shouldInclude(location, selected)) continue;

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
      minDepth: 2,
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
      shouldInclude: (location, selected) => {
        const objectRanges = selected
          .filter(
            (entry) =>
              entry.replacement.to.startsWith("_") &&
              !entry.replacement.to.startsWith("_lit_"),
          )
          .flatMap((entry) => entry.locations);
        return !isInsideAnyRange(location, objectRanges);
      },
    },
  ];

  const selectedEntries: ReplacementEntry[] = [];
  for (const spec of specs) {
    selectedEntries.push(...collectEntries(source, spec, selectedEntries));
  }

  if (selectedEntries.length === 0) {
    const [, ...lines] = content.split("\n");
    return lines.join("\n");
  }

  // Ignore the first line (assumed to be the import line)
  const [_, ...lines] = selectedEntries
    .flatMap(({ locations, replacement }) => {
      return locations.map((location) => ({ location, replacement }));
    })
    .sort((a, b) => b.location.start - a.location.start)
    .reduce((acc, { location: { start, end }, replacement: { to } }) => {
      return acc.slice(0, start) + to + acc.slice(end);
    }, content)
    .split("\n");

  let index = 0;
  for (const { replacement, comment } of selectedEntries) {
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
