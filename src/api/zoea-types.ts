export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ZoeaTranscriptFormat = "text" | "raw";

export interface ZoeaCreateSessionRequest {
  user_id: string;
  project_id?: string;
  external_id?: string;
}

export interface ZoeaCreateSessionResponse {
  session_id: string;
  status: string;
}

export interface ZoeaSessionState {
  is_streaming: boolean;
  model?: string;
  thinking_level?: string;
}

export interface ZoeaSessionStateResponse {
  state: ZoeaSessionState;
}

export interface ZoeaTextMessage {
  role: string;
  content: string;
}

export interface ZoeaTextMessagesResponse {
  format?: "text";
  messages: ZoeaTextMessage[];
}

export interface ZoeaRawMessagesResponse {
  format?: "raw";
  messages: unknown[];
}

export interface ZoeaSendMessageRequest {
  message: string;
  streaming_behavior?: string;
}

export interface ZoeaSendMessageResponse {
  accepted: boolean;
}

export interface ZoeaSessionListItem {
  session_id: string;
  user_id: string;
  project_id?: string;
  external_id?: string;
  status: string;
  created_at: string;
  last_active_at: string;
}

export interface ZoeaListSessionsResponse {
  sessions: ZoeaSessionListItem[];
}

export interface ZoeaGatewayEvent<T = unknown> {
  type: string;
  session_id?: string;
  timestamp?: string;
  data: T;
}

export interface ZoeaMessageEventData {
  message?: unknown;
}

export interface ZoeaContentEventData {
  content_index?: number;
  delta?: string;
  content?: string;
  reason?: string;
  tool_name?: string;
  tool_call?: unknown;
  message?: unknown;
  partial?: unknown;
}

export interface ZoeaToolExecStartData {
  tool_call_id: string;
  tool_name: string;
  args?: unknown;
}

export interface ZoeaToolExecUpdateData {
  tool_call_id: string;
  tool_name: string;
  partial_result?: unknown;
}

export interface ZoeaToolExecEndData {
  tool_call_id: string;
  tool_name: string;
  result?: unknown;
  is_error: boolean;
}

export interface ZoeaTurnEndData {
  message?: unknown;
  tool_results?: unknown[];
}

export interface ZoeaRunEndData {
  messages?: unknown[];
}

export interface A2uiSnapshotGroupData {
  message_id?: string;
  messages?: unknown[];
}

export interface A2uiSnapshotEventData {
  seq?: number;
  messages?: unknown[];
  groups?: A2uiSnapshotGroupData[];
}

export interface A2uiBatchEventData {
  seq?: number;
  message_id?: string;
  messages?: unknown[];
}

export interface A2uiActionEnvelope {
  type: "a2ui.action";
  data: {
    message: {
      version: "v0.9";
      action: {
        name: string;
        surfaceId: string;
        sourceComponentId: string;
        timestamp: string;
        context: Record<string, unknown>;
      };
    };
    client_data_model?: unknown;
    client_capabilities?: unknown;
  };
}

// A2uiSubmitEnvelope is the canonical chat-channel submission frame.
// The server translates this into a normal user-turn prompt to the
// agent so the agent's existing turn-taking handles the response —
// matching the A2UI agent-development guide flow.
export interface A2uiSubmitEnvelope {
  type: "a2ui.submit";
  data: {
    message_id?: string;
    surface_id: string;
    action_name?: string;
    text?: string;
    values: Record<string, unknown>;
  };
}
