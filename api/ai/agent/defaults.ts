import type { AgentLoopConfig } from "./types";

export const convertToLlm: Required<AgentLoopConfig>["convertToLlm"] = (
  messages,
) =>
  messages.filter(
    ({ role }) =>
      role === "user" || role === "assistant" || role === "toolResult",
  );
