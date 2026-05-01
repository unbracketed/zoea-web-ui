import { zoeaConfig } from "../config";
import type {
  ZoeaCreateSessionRequest,
  ZoeaCreateSessionResponse,
  ZoeaGatewayEvent,
  ZoeaRawMessagesResponse,
  ZoeaSendMessageRequest,
  ZoeaSendMessageResponse,
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

export interface ZoeaClientOptions {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
}

export class ZoeaClient {
  private readonly apiBaseUrl: string;
  private readonly wsBaseUrl: string;

  constructor(options: ZoeaClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? zoeaConfig.apiBaseUrl;
    this.wsBaseUrl = options.wsBaseUrl ?? zoeaConfig.wsBaseUrl;
  }

  async createSession(payload: ZoeaCreateSessionRequest): Promise<ZoeaCreateSessionResponse> {
    return this.request<ZoeaCreateSessionResponse>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getSessionState(sessionId: string): Promise<ZoeaSessionStateResponse> {
    return this.request<ZoeaSessionStateResponse>(`/v1/sessions/${sessionId}/state`);
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
    const response = await fetch(this.buildHttpUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
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
    const base = this.apiBaseUrl || window.location.origin;
    return new URL(path, `${base}/`).toString();
  }

  private buildWsUrl(path: string): string {
    const explicitBase = this.wsBaseUrl || this.apiBaseUrl;
    if (explicitBase) {
      const url = new URL(path, `${explicitBase}/`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    }

    const url = new URL(path, window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
}
