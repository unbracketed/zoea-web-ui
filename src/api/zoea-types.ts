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
