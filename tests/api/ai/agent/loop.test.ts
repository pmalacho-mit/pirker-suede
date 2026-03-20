import { describe, test, expect } from "vitest";
import { agentLoop } from "@release/api/ai/agent/loop.js";
import { getModelStream } from "@release/api/ai/models";
import { user } from "@release/api/ai/agent";
import type { AgentEvent } from "@release/api/ai/agent/types";
import "@release/node_modules/dotenv/config";

const onEvent = (event: AgentEvent): true => {
  switch (event.type) {
    case "agent_start":
      console.log("[agent_start]");
      return true;
    case "agent_end":
      console.log("[agent_end]", event.messages.length, "messages");
      return true;
    case "turn_start":
      console.log("[turn_start]");
      return true;
    case "turn_end":
      console.log(
        "[turn_end]",
        event.message,
        event.toolResults.length,
        "tool results",
      );
      return true;
    case "message_start":
      console.log("[message_start]", event.message);
      return true;
    case "message_update":
      console.log(
        "[message_update]",
        event.message,
        event.assistantMessageEvent,
      );
      return true;
    case "message_end":
      console.log("[message_end]", event.message);
      return true;
    case "tool_execution_start":
      console.log(
        "[tool_execution_start]",
        event.toolName,
        event.toolCallId,
        event.args,
      );
      return true;
    case "tool_execution_update":
      console.log(
        "[tool_execution_update]",
        event.toolName,
        event.toolCallId,
        event.partialResult,
      );
      return true;
    case "tool_execution_end":
      console.log(
        "[tool_execution_end]",
        event.toolName,
        event.toolCallId,
        event.result,
        event.isError ? "ERROR" : "OK",
      );
      return true;
  }
};

describe("agentLoop", () => {
  test(agentLoop.name, async () => {
    const abortController = new AbortController();
    const stream = getModelStream("anthropic", "claude-haiku-4-5");
    const events = agentLoop({
      prompts: [user("What is the meaning of life?")],
      config: { stream },
      signal: abortController.signal,
      context: {
        systemPrompt:
          "You are a helpful assistant with an incredible sense of humor.",
        messages: [],
      },
    });

    for await (const chunk of events) expect(onEvent(chunk)).toBe(true);
  });
});
