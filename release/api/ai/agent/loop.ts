/**
 * Agent loop that works with AgentMessage throughout.
 * Transforms to Message[] only at the LLM call boundary.
 */

import {
  type AssistantMessage,
  type Context,
  EventStream,
  type ToolResultMessage,
  validateToolArguments,
} from "@mariozechner/pi-ai";
import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  StreamFn,
} from "./types.js";

export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

export type LoopPayload = {
  /**
   * The initial prompts for the agent loop.
   *
   * If not provided, the loop will continue from the existing context messages.
   * In this case, the last message in context MUST be a user or toolResult message (not assistant).
   * */
  prompts?: AgentMessage[];
  /** The current context of the agent */
  context: AgentContext;
  /** Configuration for the agent loop */
  config: AgentLoopConfig;
  /** Signal to abort the agent loop */
  signal: AbortSignal;
  streamFn: StreamFn;
};

/**
 * Start an agent loop with either:
 * - new prompt message(s)
 * - continue from existing context (must end with user or toolResult message)
 */
export function agentLoop(
  payload: LoopPayload,
): EventStream<AgentEvent, AgentMessage[]> {
  validateStartCondition(payload);
  const { stream, emit, end } = createAgentEventMechanism();
  runAgentLoop(payload, emit).then(end);
  return stream;
}

/**
 * Confirms that the loop can start based on the provided payload.
 * - If prompts are provided, it's always valid to start.
 * - If no prompts, checks that context has messages and does not end with an assistant message.
 */
const validateStartCondition = ({
  prompts,
  context: { messages },
}: LoopPayload) => {
  if (prompts && prompts.length > 0) return;
  if (messages.length === 0)
    throw new Error("Cannot continue: no messages in context");
  if (messages[messages.length - 1].role === "assistant")
    throw new Error("Cannot continue from message role: assistant");
};

export async function runAgentLoop(
  { prompts, context, config, signal, streamFn }: LoopPayload,
  emit: AgentEventSink,
): Promise<AgentMessage[]> {
  const newMessages = prompts ? [...prompts] : [];
  const currentContext = {
    ...context,
    messages: [...context.messages, ...newMessages],
  } satisfies AgentContext;

  await emit({ type: "agent_start" });
  await emit({ type: "turn_start" });

  if (prompts)
    for (const prompt of prompts) {
      await emit({ type: "message_start", message: prompt });
      await emit({ type: "message_end", message: prompt });
    }

  await runLoop(currentContext, newMessages, config, signal, emit, streamFn);
  return newMessages;
}

type EventMechanism = {
  stream: EventStream<AgentEvent, AgentMessage[]>;
  emit: AgentEventSink;
  end: (finalMessages: AgentMessage[]) => void;
};

function createAgentEventMechanism(): EventMechanism {
  const stream = new EventStream<AgentEvent, AgentMessage[]>(
    (event: AgentEvent) => event.type === "agent_end",
    (event: AgentEvent) => (event.type === "agent_end" ? event.messages : []),
  );
  return {
    stream,
    emit: (event) => stream.push(event),
    end: (finalMessages) => stream.end(finalMessages),
  };
}

/**
 * Main loop logic shared by agentLoop and agentLoopContinue.
 */
async function runLoop(
  currentContext: AgentContext,
  newMessages: AgentMessage[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFn: StreamFn,
): Promise<void> {
  let firstTurn = true;
  // Check for steering messages at start (user may have typed while waiting)
  let pendingMessages: AgentMessage[] =
    (await config.getSteeringMessages?.()) || [];

  // Outer loop: continues when queued follow-up messages arrive after agent would stop
  while (true) {
    let hasMoreToolCalls = true;

    // Inner loop: process tool calls and steering messages
    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (!firstTurn) await emit({ type: "turn_start" });
      else firstTurn = false;

      // Process pending messages (inject before next assistant response)
      if (pendingMessages.length > 0) {
        for (const message of pendingMessages) {
          await emit({ type: "message_start", message });
          await emit({ type: "message_end", message });
          currentContext.messages.push(message);
          newMessages.push(message);
        }
        pendingMessages.length = 0;
      }

      // Stream assistant response
      const message = await streamAssistantResponse(
        currentContext,
        config,
        signal,
        emit,
        streamFn,
      );
      newMessages.push(message);

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        await emit({ type: "turn_end", message, toolResults: [] });
        await emit({ type: "agent_end", messages: newMessages });
        return;
      }

      // Check for tool calls
      const toolCalls = message.content.filter((c) => c.type === "toolCall");
      hasMoreToolCalls = toolCalls.length > 0;

      const toolResults: ToolResultMessage[] = [];
      if (hasMoreToolCalls) {
        toolResults.push(
          ...(await executeToolCalls(
            currentContext,
            message,
            config,
            signal,
            emit,
          )),
        );

        for (const result of toolResults) {
          currentContext.messages.push(result);
          newMessages.push(result);
        }
      }

      await emit({ type: "turn_end", message, toolResults });

      pendingMessages = (await config.getSteeringMessages?.()) || [];
    }

    // Agent would stop here. Check for follow-up messages.
    const followUpMessages = (await config.getFollowUpMessages?.()) || [];
    if (followUpMessages.length > 0) {
      // Set as pending so inner loop processes them
      pendingMessages = followUpMessages;
      continue;
    }

    // No more messages, exit
    break;
  }

  await emit({ type: "agent_end", messages: newMessages });
}

/**
 * Stream an assistant response from the LLM.
 * This is where AgentMessage[] gets transformed to Message[] for the LLM.
 */
async function streamAssistantResponse(
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFn: StreamFn,
): Promise<AssistantMessage> {
  // Apply context transform if configured (AgentMessage[] → AgentMessage[])
  let messages = context.messages;
  if (config.transformContext) {
    messages = await config.transformContext(messages, signal);
  }

  const llmContext: Context = {
    systemPrompt: context.systemPrompt,
    messages: await config.convertToLlm(messages),
    tools: context.tools,
  };

  const response = await streamFn(config.model, llmContext, {
    ...config,
    signal,
  });

  let partialMessage: AssistantMessage | null = null;
  let addedPartial = false;

  for await (const event of response) {
    switch (event.type) {
      case "start":
        partialMessage = event.partial;
        context.messages.push(partialMessage);
        addedPartial = true;
        await emit({ type: "message_start", message: { ...partialMessage } });
        break;

      case "text_start":
      case "text_delta":
      case "text_end":
      case "thinking_start":
      case "thinking_delta":
      case "thinking_end":
      case "toolcall_start":
      case "toolcall_delta":
      case "toolcall_end":
        if (partialMessage) {
          partialMessage = event.partial;
          context.messages[context.messages.length - 1] = partialMessage;
          await emit({
            type: "message_update",
            assistantMessageEvent: event,
            message: { ...partialMessage },
          });
        }
        break;

      case "done":
      case "error": {
        const finalMessage = await response.result();
        if (addedPartial) {
          context.messages[context.messages.length - 1] = finalMessage;
        } else {
          context.messages.push(finalMessage);
        }
        if (!addedPartial) {
          await emit({ type: "message_start", message: { ...finalMessage } });
        }
        await emit({ type: "message_end", message: finalMessage });
        return finalMessage;
      }
    }
  }

  const finalMessage = await response.result();
  if (addedPartial) {
    context.messages[context.messages.length - 1] = finalMessage;
  } else {
    context.messages.push(finalMessage);
    await emit({ type: "message_start", message: { ...finalMessage } });
  }
  await emit({ type: "message_end", message: finalMessage });
  return finalMessage;
}

/**
 * Execute tool calls from an assistant message.
 */
async function executeToolCalls(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ToolResultMessage[]> {
  const toolCalls = assistantMessage.content.filter(
    (c) => c.type === "toolCall",
  );
  if (config.toolExecution === "sequential") {
    return executeToolCallsSequential(
      currentContext,
      assistantMessage,
      toolCalls,
      config,
      signal,
      emit,
    );
  }
  return executeToolCallsParallel(
    currentContext,
    assistantMessage,
    toolCalls,
    config,
    signal,
    emit,
  );
}

async function executeToolCallsSequential(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  toolCalls: AgentToolCall[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ToolResultMessage[]> {
  const results: ToolResultMessage[] = [];

  for (const toolCall of toolCalls) {
    await emit({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });

    const preparation = await prepareToolCall(
      currentContext,
      assistantMessage,
      toolCall,
      config,
      signal,
    );
    if (preparation.kind === "immediate") {
      results.push(
        await emitToolCallOutcome(
          toolCall,
          preparation.result,
          preparation.isError,
          emit,
        ),
      );
    } else {
      const executed = await executePreparedToolCall(preparation, signal, emit);
      results.push(
        await finalizeExecutedToolCall(
          currentContext,
          assistantMessage,
          preparation,
          executed,
          config,
          signal,
          emit,
        ),
      );
    }
  }

  return results;
}

async function executeToolCallsParallel(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  toolCalls: AgentToolCall[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ToolResultMessage[]> {
  const results: ToolResultMessage[] = [];
  const runnableCalls: PreparedToolCall[] = [];

  for (const toolCall of toolCalls) {
    await emit({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });

    const preparation = await prepareToolCall(
      currentContext,
      assistantMessage,
      toolCall,
      config,
      signal,
    );
    if (preparation.kind === "immediate") {
      results.push(
        await emitToolCallOutcome(
          toolCall,
          preparation.result,
          preparation.isError,
          emit,
        ),
      );
    } else {
      runnableCalls.push(preparation);
    }
  }

  const runningCalls = runnableCalls.map((prepared) => ({
    prepared,
    execution: executePreparedToolCall(prepared, signal, emit),
  }));

  for (const running of runningCalls) {
    const executed = await running.execution;
    results.push(
      await finalizeExecutedToolCall(
        currentContext,
        assistantMessage,
        running.prepared,
        executed,
        config,
        signal,
        emit,
      ),
    );
  }

  return results;
}

type PreparedToolCall = {
  kind: "prepared";
  toolCall: AgentToolCall;
  tool: AgentTool<any>;
  args: unknown;
};

type ImmediateToolCallOutcome = {
  kind: "immediate";
  result: AgentToolResult<any>;
  isError: boolean;
};

type ExecutedToolCallOutcome = {
  result: AgentToolResult<any>;
  isError: boolean;
};

async function prepareToolCall(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  toolCall: AgentToolCall,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
): Promise<PreparedToolCall | ImmediateToolCallOutcome> {
  const tool = currentContext.tools?.find((t) => t.name === toolCall.name);
  if (!tool) {
    return {
      kind: "immediate",
      result: createErrorToolResult(`Tool ${toolCall.name} not found`),
      isError: true,
    };
  }

  try {
    const validatedArgs = validateToolArguments(tool, toolCall);
    if (config.beforeToolCall) {
      const beforeResult = await config.beforeToolCall(
        {
          assistantMessage,
          toolCall,
          args: validatedArgs,
          context: currentContext,
        },
        signal,
      );
      if (beforeResult?.block) {
        return {
          kind: "immediate",
          result: createErrorToolResult(
            beforeResult.reason || "Tool execution was blocked",
          ),
          isError: true,
        };
      }
    }
    return {
      kind: "prepared",
      toolCall,
      tool,
      args: validatedArgs,
    };
  } catch (error) {
    return {
      kind: "immediate",
      result: createErrorToolResult(
        error instanceof Error ? error.message : String(error),
      ),
      isError: true,
    };
  }
}

async function executePreparedToolCall(
  prepared: PreparedToolCall,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolCallOutcome> {
  const updateEvents: Promise<void>[] = [];

  try {
    const result = await prepared.tool.execute(
      prepared.toolCall.id,
      prepared.args as never,
      signal,
      (partialResult) => {
        updateEvents.push(
          Promise.resolve(
            emit({
              type: "tool_execution_update",
              toolCallId: prepared.toolCall.id,
              toolName: prepared.toolCall.name,
              args: prepared.toolCall.arguments,
              partialResult,
            }),
          ),
        );
      },
    );
    await Promise.all(updateEvents);
    return { result, isError: false };
  } catch (error) {
    await Promise.all(updateEvents);
    return {
      result: createErrorToolResult(
        error instanceof Error ? error.message : String(error),
      ),
      isError: true,
    };
  }
}

async function finalizeExecutedToolCall(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  prepared: PreparedToolCall,
  executed: ExecutedToolCallOutcome,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ToolResultMessage> {
  let result = executed.result;
  let isError = executed.isError;

  if (config.afterToolCall) {
    const afterResult = await config.afterToolCall(
      {
        assistantMessage,
        toolCall: prepared.toolCall,
        args: prepared.args,
        result,
        isError,
        context: currentContext,
      },
      signal,
    );
    if (afterResult) {
      result = {
        content: afterResult.content ?? result.content,
        details: afterResult.details ?? result.details,
      };
      isError = afterResult.isError ?? isError;
    }
  }

  return await emitToolCallOutcome(prepared.toolCall, result, isError, emit);
}

function createErrorToolResult(message: string): AgentToolResult<any> {
  return {
    content: [{ type: "text", text: message }],
    details: {},
  };
}

async function emitToolCallOutcome(
  toolCall: AgentToolCall,
  result: AgentToolResult<any>,
  isError: boolean,
  emit: AgentEventSink,
): Promise<ToolResultMessage> {
  await emit({
    type: "tool_execution_end",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError,
  });

  const toolResultMessage: ToolResultMessage = {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    details: result.details,
    isError,
    timestamp: Date.now(),
  };

  await emit({ type: "message_start", message: toolResultMessage });
  await emit({ type: "message_end", message: toolResultMessage });
  return toolResultMessage;
}
