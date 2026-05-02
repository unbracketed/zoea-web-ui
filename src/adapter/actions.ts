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
  a2uiSeq?: number;
  a2uiSurfaceIds: readonly string[];
  // Assistant message ids that own one or more A2UI surfaces. The chat
  // renderer uses this to decide which message bubbles need an inline
  // surface block — driving the chat-channel A2UI rendering described
  // in the agent-development guide.
  a2uiMessageIds: readonly string[];
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
  | { type: "a2ui.snapshot.received"; seq?: number; surfaceIds: readonly string[]; messageIds: readonly string[] }
  | { type: "a2ui.batch.received"; seq?: number; surfaceIds: readonly string[]; messageIds: readonly string[] }
  | { type: "a2ui.updated"; surfaceIds: readonly string[]; messageIds: readonly string[] }
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
    a2uiSurfaceIds: [],
    a2uiMessageIds: [],
  };
}
