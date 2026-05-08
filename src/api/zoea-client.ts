import type {
  ZoeaCreateSessionRequest,
  ZoeaCreateSessionResponse,
  ZoeaGatewayEvent,
  ZoeaListSessionsResponse,
  ZoeaRawMessagesResponse,
  ZoeaSendMessageRequest,
  ZoeaSendMessageResponse,
  ZoeaServerConfig,
  ZoeaServerInfo,
  ZoeaSessionStateResponse,
  ZoeaTextMessagesResponse,
  ZoeaTranscriptFormat,
} from "./zoea-types";

export interface ZoeaStreamHandlers {
  onOpen?: () => void;
  onMessage?: (event: ZoeaGatewayEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

// proxyTarget is the upstream host the dev proxy should forward to —
// e.g. "http://localhost:14014". The browser ALWAYS calls the page
// origin; this string is sent as a per-request hint (X-Zoea-Target
// header for REST, ?zoeaTarget=... query param for the WebSocket
// upgrade since browsers can't set custom WS headers). Empty/omitted
// means "use the dev proxy's compiled-in fallback".
export interface ZoeaClientOptions {
  proxyTarget?: string;
}

const TARGET_HEADER = "X-Zoea-Target";
const TARGET_QUERY = "zoeaTarget";

export interface ZoeaListSessionsOptions {
  userId?: string;
  externalId?: string;
  workingDir?: string;
  limit?: number;
  offset?: number;
}

export class ZoeaClient {
  private readonly proxyTarget: string;

  constructor(options: ZoeaClientOptions = {}) {
    this.proxyTarget = (options.proxyTarget ?? "").replace(/\/+$/, "");
  }

  async createSession(payload: ZoeaCreateSessionRequest): Promise<ZoeaCreateSessionResponse> {
    return this.request<ZoeaCreateSessionResponse>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async resumeSession(sessionId: string): Promise<ZoeaCreateSessionResponse> {
    return this.request<ZoeaCreateSessionResponse>(`/v1/sessions/${sessionId}/resume`, {
      method: "POST",
    });
  }

  async getSessionState(sessionId: string): Promise<ZoeaSessionStateResponse> {
    return this.request<ZoeaSessionStateResponse>(`/v1/sessions/${sessionId}/state`);
  }

  async listSessions(options: ZoeaListSessionsOptions = {}): Promise<ZoeaListSessionsResponse> {
    const params = new URLSearchParams();
    if (options.userId) params.set("user_id", options.userId);
    if (options.externalId) params.set("external_id", options.externalId);
    if (options.workingDir) params.set("working_dir", options.workingDir);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.offset === "number") params.set("offset", String(options.offset));
    const query = params.toString();
    const path = query ? `/v1/sessions?${query}` : "/v1/sessions";
    return this.request<ZoeaListSessionsResponse>(path);
  }

  async getServerInfo(): Promise<ZoeaServerInfo> {
    return this.request<ZoeaServerInfo>("/v1/server-info");
  }

  async getServerConfig(): Promise<ZoeaServerConfig> {
    return this.request<ZoeaServerConfig>("/v1/config");
  }

  async getMessages(sessionId: string, format: ZoeaTranscriptFormat): Promise<ZoeaRawMessagesResponse | ZoeaTextMessagesResponse> {
    const path = format === "raw"
      ? `/v1/sessions/${sessionId}/messages?format=raw`
      : `/v1/sessions/${sessionId}/messages`;
    return this.request<ZoeaRawMessagesResponse | ZoeaTextMessagesResponse>(path);
  }

  async sendMessage(sessionId: string, payload: ZoeaSendMessageRequest): Promise<ZoeaSendMessageResponse> {
    return this.request<ZoeaSendMessageResponse>(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async abort(sessionId: string): Promise<void> {
    await this.request(`/v1/sessions/${sessionId}/abort`, { method: "POST" });
  }

  connectSessionStream(sessionId: string, handlers: ZoeaStreamHandlers = {}): WebSocket {
    const ws = new WebSocket(this.buildWsUrl(`/v1/sessions/${sessionId}/stream`));

    ws.addEventListener("open", () => handlers.onOpen?.());
    ws.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as ZoeaGatewayEvent;
        handlers.onMessage?.(parsed);
      } catch (error) {
        console.error("Failed to parse Zoea WS event", error, event.data);
      }
    });
    ws.addEventListener("close", (event) => handlers.onClose?.(event));
    ws.addEventListener("error", (event) => handlers.onError?.(event));

    return ws;
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.proxyTarget) {
      headers[TARGET_HEADER] = this.proxyTarget;
    }
    const response = await fetch(this.buildHttpUrl(path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
          message = body.error;
        }
      } catch {
        // Ignore JSON parse failures on error paths.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private buildHttpUrl(path: string): string {
    return new URL(path, `${window.location.origin}/`).toString();
  }

  private buildWsUrl(path: string): string {
    const url = new URL(path, window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (this.proxyTarget) {
      url.searchParams.set(TARGET_QUERY, this.proxyTarget);
    }
    return url.toString();
  }
}
