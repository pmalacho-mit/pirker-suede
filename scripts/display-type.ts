import { Project } from "ts-morph";
import * as path from "node:path";

const project = new Project({
  compilerOptions: { strict: true },
  skipAddingFilesFromTsConfig: true,
});
const sourceFile = project.addSourceFileAtPath(
  "/workspaces/pirker-suede/release/api/ai/models/index.d.ts",
);
const typeAlias = sourceFile.getTypeAliasOrThrow(
  "StreamOptionsByProviderAndModel",
);
const text = typeAlias.getType().getText(typeAlias);
console.log(`type x = ${text}`);
