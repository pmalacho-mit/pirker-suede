import { ensureTool, TOOLS } from "../api/ai/tools/external/index.js";

const EXTERNAL_TOOLS = Object.keys(TOOLS) as (keyof typeof TOOLS)[];

async function main(): Promise<void> {
  const unavailableTools: string[] = [];

  for (const tool of EXTERNAL_TOOLS) {
    const resolvedPath = await ensureTool(tool);
    if (!resolvedPath) {
      unavailableTools.push(tool);
    }
  }

  if (unavailableTools.length > 0) {
    console.warn(
      `[install] optional tools unavailable: ${unavailableTools.join(", ")}`,
    );
    return;
  }

  console.log(`[install] external tools ready: ${EXTERNAL_TOOLS.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(
    `[install] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
