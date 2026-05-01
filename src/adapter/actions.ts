import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-web-ui";
import type { ZoeaGatewayEvent } from "../api/zoea-types";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface ZoeaAgentState {
  sessionId?: string;
  userId: string;
  projectId?: string;
  connection: ConnectionStatus;
  isStreaming: boolean;
  model?: string;
  thinkingLevel?: string;
  messages: AgentMessage[];
  streamingMessage: AssistantMessage | null;
  pendingToolCalls: ReadonlySet<string>;
  transientToolResults: ReadonlyMap<string, ToolResultMessage>;
  lastError?: string;
}

export type ZoeaAction =
  | { type: "session.created"; sessionId: string; userId: string; projectId?: string }
  | { type: "session.cache.loaded"; messages: AgentMessage[]; model?: string; thinkingLevel?: string }
  | { type: "session.hydrated"; messages: AgentMessage[]; model?: string; thinkingLevel?: string }
  | { type: "state.loaded"; model?: string; thinkingLevel?: string; isStreaming: boolean }
  | { type: "ws.connecting" }
  | { type: "ws.connected" }
  | { type: "ws.closed"; reconnecting: boolean }
  | { type: "prompt.optimistic"; text: string; timestamp: number }
  | { type: "gateway.event"; event: ZoeaGatewayEvent }
  | { type: "error"; message: string };

export function createInitialState(userId: string, projectId?: string): ZoeaAgentState {
  return {
    userId,
    projectId,
    connection: "idle",
    isStreaming: false,
    messages: [],
    streamingMessage: null,
    pendingToolCalls: new Set(),
    transientToolResults: new Map(),
  };
}
