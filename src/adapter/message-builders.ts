import type {
  AssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-web-ui";
import type { ZoeaAgentState } from "./actions";

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function textContent(text: string): TextContent {
  return { type: "text", text };
}

function createEmptyAssistant(model?: string): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-responses" as any,
    provider: "zoea" as any,
    model: model || "unknown",
    usage: EMPTY_USAGE,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function slotId(contentIndex?: number): string {
  return `toolcall:${contentIndex ?? 0}`;
}

function cloneAssistant(message: AssistantMessage): AssistantMessage {
  return {
    ...message,
    content: [...message.content],
    usage: message.usage || EMPTY_USAGE,
  };
}

function upsertContent<T extends TextContent | ThinkingContent | ToolCall>(
  message: AssistantMessage,
  content: T,
  contentIndex?: number,
): AssistantMessage {
  const next = cloneAssistant(message);
  if (typeof contentIndex === "number") {
    next.content[contentIndex] = content;
    return next;
  }
  next.content.push(content);
  return next;
}

export function createOptimisticUserMessage(text: string, timestamp = Date.now()): UserMessage {
  return {
    role: "user",
    content: [textContent(text)],
    timestamp,
  };
}

export function coerceAgentMessages(values: unknown[]): AgentMessage[] {
  return values
    .map((value) => coerceAgentMessage(value))
    .filter((value): value is AgentMessage => value !== null);
}

export function coerceAgentMessage(value: unknown): AgentMessage | null {
  if (!isRecord(value) || typeof value.role !== "string") {
    return null;
  }
  return value as AgentMessage;
}

export function coerceTextMessages(values: Array<{ role: string; content: string }>): AgentMessage[] {
  return values.map((value, index) => {
    if (value.role === "assistant") {
      return {
        ...createEmptyAssistant("unknown"),
        content: [textContent(value.content)],
        timestamp: Date.now() + index,
      } satisfies AssistantMessage;
    }

    return createOptimisticUserMessage(value.content, Date.now() + index);
  });
}

export function ensureStreamingAssistant(state: ZoeaAgentState): AssistantMessage {
  return state.streamingMessage ? cloneAssistant(state.streamingMessage) : createEmptyAssistant(state.model);
}

export function assistantFromUnknown(value: unknown, fallbackModel?: string): AssistantMessage | null {
  if (!isRecord(value) || value.role !== "assistant" || !Array.isArray(value.content)) {
    return null;
  }
  return {
    ...createEmptyAssistant(fallbackModel),
    ...value,
  } as AssistantMessage;
}

export function assistantFromEventPayload(
  payload: { partial?: unknown; message?: unknown } | undefined,
  fallbackModel?: string,
): AssistantMessage | null {
  if (!payload) {
    return null;
  }
  return assistantFromUnknown(payload.partial, fallbackModel) || assistantFromUnknown(payload.message, fallbackModel);
}

export function toolResultsFromUnknown(value: unknown): ToolResultMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => isRecord(item) && item.role === "toolResult") as ToolResultMessage[];
}

export function applyThinkingDelta(
  message: AssistantMessage,
  delta: string,
  contentIndex?: number,
): AssistantMessage {
  const next = cloneAssistant(message);
  const index = typeof contentIndex === "number" ? contentIndex : next.content.findIndex((item) => item.type === "thinking");
  const previous = index >= 0 && next.content[index]?.type === "thinking"
    ? (next.content[index] as ThinkingContent).thinking
    : "";
  return upsertContent(next, { type: "thinking", thinking: previous + delta }, contentIndex ?? (index >= 0 ? index : undefined));
}

export function applyTextDelta(message: AssistantMessage, delta: string, contentIndex?: number): AssistantMessage {
  const next = cloneAssistant(message);
  const index = typeof contentIndex === "number" ? contentIndex : next.content.findIndex((item) => item.type === "text");
  const previous = index >= 0 && next.content[index]?.type === "text"
    ? (next.content[index] as TextContent).text
    : "";
  return upsertContent(next, { type: "text", text: previous + delta }, contentIndex ?? (index >= 0 ? index : undefined));
}

export function applyToolCallStart(
  message: AssistantMessage,
  toolName?: string,
  contentIndex?: number,
): AssistantMessage {
  return upsertContent(message, {
    type: "toolCall",
    id: slotId(contentIndex),
    name: toolName || "tool",
    arguments: {},
  }, contentIndex);
}

export function applyToolCallDelta(message: AssistantMessage, delta: string, contentIndex?: number): AssistantMessage {
  const next = cloneAssistant(message);
  const index = typeof contentIndex === "number" ? contentIndex : next.content.findIndex((item) => item.type === "toolCall");
  const previous: ToolCall = index >= 0 && next.content[index]?.type === "toolCall"
    ? (next.content[index] as ToolCall)
    : { type: "toolCall", id: slotId(contentIndex), name: "tool", arguments: {} };

  const updated: ToolCall = {
    ...previous,
    type: "toolCall",
    arguments: {
      ...(isRecord(previous.arguments) ? previous.arguments : {}),
      _partial: `${(previous.arguments as Record<string, any> | undefined)?._partial || ""}${delta}`,
    },
  };

  return upsertContent(next, updated, contentIndex ?? (index >= 0 ? index : undefined));
}

export function applyToolCallEnd(message: AssistantMessage, toolCall: unknown, contentIndex?: number): AssistantMessage {
  if (!isRecord(toolCall) || typeof toolCall.id !== "string" || typeof toolCall.name !== "string") {
    return message;
  }
  return upsertContent(message, {
    type: "toolCall",
    id: toolCall.id,
    name: toolCall.name,
    arguments: isRecord(toolCall.arguments) ? toolCall.arguments : {},
    thoughtSignature: typeof toolCall.thoughtSignature === "string" ? toolCall.thoughtSignature : undefined,
  }, contentIndex);
}

export function toolResultFromGateway(
  toolCallId: string,
  toolName: string,
  result: unknown,
  isError: boolean,
): ToolResultMessage {
  const record = isRecord(result) ? result : {};
  const content = Array.isArray(record.content)
    ? (record.content as ToolResultMessage["content"])
    : [textContent(typeof result === "string" ? result : JSON.stringify(result ?? {}))];

  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content,
    details: record.details,
    isError,
    timestamp: Date.now(),
  };
}
