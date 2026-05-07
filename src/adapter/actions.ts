import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-web-ui";
import type { ZoeaGatewayEvent } from "../api/zoea-types";

// A2uiFormMessage is a synthetic chat-list entry — NOT a real LLM
// message. It represents one A2UI surface as a first-class item in the
// timeline so the form scrolls with chat, persists across reload (via
// the broker's snapshot), and carries its own pending → submitted /
// cancelled state. The reducer inserts it on agent.a2ui events and
// updates it on agent.a2ui.submission events. It must NOT be sent to
// the LLM transcript or to <message-list>; selectors filter it out.
export interface A2uiFormMessage {
  role: "a2uiForm";
  surfaceId: string;
  // The assistant message that "owns" this form. Empty when the
  // surface arrived without correlation (rendered in the orphan
  // panel).
  messageId: string;
  // Timeline anchor — the responseId of the assistant message this
  // form should appear after. Same as messageId today, kept distinct
  // so future flows can decouple "owner" from "anchor".
  anchorAfterMessageId: string;
  status: "pending" | "submitted" | "cancelled";
  // Captured user inputs at the moment of submission. Kept verbatim
  // so the closed card can list them. Undefined while pending.
  submittedValues?: Record<string, unknown>;
  submittedAction?: string;
  submittedAt?: string;
  // Stable timestamp used for de-dup / ordering. Set when the message
  // is first inserted.
  createdAt: string;
}

// ZoeaArtifact is a single artifact produced by a tool run, ready to
// render. URL is pre-built relative to the active server's API base so
// the chat view doesn't have to thread server identity through.
export interface ZoeaArtifact {
  toolCallId: string;
  resultIndex: number;
  runId: string;
  name: string;
  relativePath: string;
  mediaType?: string;
  bytes: number;
  metadata?: Record<string, unknown>;
  url: string;
}

// ArtifactsRowMessage is a synthetic chat-list entry that anchors a
// row of artifact pills under a tool result. Like A2uiFormMessage, it
// never reaches the LLM transcript and is filtered out of selectors
// that feed into pi-web-ui.
export interface ArtifactsRowMessage {
  role: "zoeaArtifacts";
  toolCallId: string;
  artifacts: ZoeaArtifact[];
  createdAt: string;
}

// ChatListMessage is the union the chat-view renderer iterates. It
// extends pi-web-ui's AgentMessage with our synthetic form items.
export type ChatListMessage = AgentMessage | A2uiFormMessage | ArtifactsRowMessage;

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
  messages: ChatListMessage[];
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
  // Keyed by tool-call id. Populated from agent.tool.end events that
  // carry details.zoea.results, and again on transcript hydrate. The
  // chat view inserts an ArtifactsRowMessage after the matching tool
  // result; this map is the source of truth on resume.
  artifactsByToolCall: ReadonlyMap<string, ZoeaArtifact[]>;
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
  | { type: "a2ui.surface.created"; surfaceId: string; messageId: string }
  | { type: "a2ui.surface.deleted"; surfaceId: string }
  | {
      type: "a2ui.surface.submitted";
      surfaceId: string;
      messageId: string;
      action?: string;
      values?: Record<string, unknown>;
      status: "submitted" | "cancelled";
      at?: string;
    }
  | { type: "a2ui.surfaces.rehydrate"; entries: A2uiFormMessage[] }
  | { type: "artifacts.attach"; toolCallId: string; artifacts: ZoeaArtifact[] }
  | { type: "artifacts.rehydrate"; rows: ArtifactsRowMessage[] }
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
    artifactsByToolCall: new Map(),
  };
}
