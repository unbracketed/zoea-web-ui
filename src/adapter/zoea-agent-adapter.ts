import { ZoeaClient, type ZoeaClientOptions, type ZoeaListSessionsOptions } from "../api/zoea-client";
import type {
  A2uiBatchEventData,
  A2uiSnapshotEventData,
  ZoeaGatewayEvent,
  ZoeaListSessionsResponse,
  ZoeaRawMessagesResponse,
  ZoeaTextMessagesResponse,
} from "../api/zoea-types";
import { loadSessionSnapshot, saveSessionSnapshot } from "../storage/session-cache";
import { A2uiSessionController } from "../a2ui/a2ui-session-controller";
import { createInitialState, type ZoeaAction, type ZoeaAgentState } from "./actions";
import { coerceAgentMessages, coerceTextMessages } from "./message-builders";
import { reduceState } from "./reducer";

export interface ZoeaAgentAdapterOptions extends ZoeaClientOptions {
  userId: string;
  projectId?: string;
}

export class ZoeaAgentAdapter {
  private readonly client: ZoeaClient;
  private readonly listeners = new Set<(state: ZoeaAgentState) => void>();
  public readonly a2ui: A2uiSessionController;
  private ws?: WebSocket;
  private reconnectTimer?: number;
  private manualDisconnect = false;
  private reconnectAttempts = 0;

  public state: ZoeaAgentState;

  constructor(private readonly options: ZoeaAgentAdapterOptions) {
    this.client = new ZoeaClient(options);
    this.state = createInitialState(options.userId, options.projectId);
    this.a2ui = new A2uiSessionController((action) => {
      this.sendA2uiAction(action);
    });
  }

  subscribe(listener: (state: ZoeaAgentState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async createSession(input: { userId?: string; projectId?: string; externalId?: string } = {}): Promise<string> {
    const response = await this.client.createSession({
      user_id: input.userId || this.options.userId,
      project_id: input.projectId || this.options.projectId,
      external_id: input.externalId,
    });

    this.handleSessionAttached(response.session_id, input.userId || this.options.userId, input.projectId || this.options.projectId);
    return response.session_id;
  }

  async attachSession(sessionId: string): Promise<void> {
    if (this.state.sessionId !== sessionId) {
      this.handleSessionAttached(sessionId, this.options.userId, this.options.projectId);
    }

    const snapshot = loadSessionSnapshot(sessionId);
    if (snapshot) {
      this.dispatch({
        type: "session.cache.loaded",
        messages: snapshot.messages,
        model: snapshot.model,
        thinkingLevel: snapshot.thinkingLevel,
      });
    }

    await this.hydrate();
    await this.connectStream();
  }

  async hydrate(): Promise<void> {
    if (!this.state.sessionId) {
      throw new Error("No session attached");
    }

    const [stateResponse, transcript] = await Promise.all([
      this.client.getSessionState(this.state.sessionId),
      this.loadTranscript(this.state.sessionId),
    ]);

    this.dispatch({
      type: "state.loaded",
      model: stateResponse.state.model,
      thinkingLevel: stateResponse.state.thinking_level,
      isStreaming: stateResponse.state.is_streaming,
    });

    this.dispatch({
      type: "session.hydrated",
      messages: transcript.messages,
      model: stateResponse.state.model,
      thinkingLevel: stateResponse.state.thinking_level,
    });
  }

  async connectStream(): Promise<void> {
    if (!this.state.sessionId) {
      throw new Error("No session attached");
    }

    this.disconnectStream();
    this.manualDisconnect = false;
    this.dispatch({ type: "ws.connecting" });

    const ws = this.client.connectSessionStream(this.state.sessionId, {
      onOpen: () => {
        if (this.ws !== ws) {
          return;
        }
        this.reconnectAttempts = 0;
        this.dispatch({ type: "ws.connected" });
      },
      onMessage: (event) => {
        if (this.ws !== ws) {
          return;
        }
        this.routeGatewayEvent(event);
      },
      onClose: () => {
        if (this.ws !== ws) {
          return;
        }
        this.ws = undefined;
        const reconnecting = !this.manualDisconnect;
        this.dispatch({ type: "ws.closed", reconnecting });
        if (reconnecting) {
          this.scheduleReconnect();
        }
      },
      onError: () => {
        if (this.ws !== ws) {
          return;
        }
        this.dispatch({ type: "error", message: "WebSocket stream error" });
      },
    });

    this.ws = ws;
  }

  disconnectStream(): void {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const ws = this.ws;
    this.ws = undefined;
    ws?.close();
  }

  async prompt(text: string): Promise<void> {
    const sessionId = this.state.sessionId;
    if (!sessionId || !text.trim()) {
      return;
    }

    await this.client.sendMessage(sessionId, { message: text });
    this.dispatch({ type: "prompt.optimistic", text, timestamp: Date.now() });
  }

  async abort(): Promise<void> {
    if (!this.state.sessionId) {
      return;
    }
    await this.client.abort(this.state.sessionId);
  }

  async listSessions(options: ZoeaListSessionsOptions = {}): Promise<ZoeaListSessionsResponse> {
    return this.client.listSessions(options);
  }

  destroy(): void {
    this.disconnectStream();
    this.listeners.clear();
    this.a2ui.dispose();
  }

  private handleSessionAttached(sessionId: string, userId: string, projectId?: string): void {
    this.a2ui.reset();
    this.dispatch({
      type: "session.created",
      sessionId,
      userId,
      projectId,
    });
  }

  private routeGatewayEvent(event: ZoeaGatewayEvent): void {
    if (event.type === "agent.a2ui.snapshot") {
      const data = (event.data || {}) as A2uiSnapshotEventData;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      this.a2ui.applySnapshot(typeof data.seq === "number" ? data.seq : undefined, messages);
      this.dispatch({
        type: "a2ui.snapshot.received",
        seq: this.a2ui.getSeq(),
        surfaceIds: this.a2ui.getSurfaceIds(),
      });
      return;
    }

    if (event.type === "agent.a2ui") {
      const data = (event.data || {}) as A2uiBatchEventData;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      this.a2ui.applyBatch(typeof data.seq === "number" ? data.seq : undefined, messages);
      this.dispatch({
        type: "a2ui.batch.received",
        seq: this.a2ui.getSeq(),
        surfaceIds: this.a2ui.getSurfaceIds(),
      });
      return;
    }

    this.dispatch({ type: "gateway.event", event });
  }

  private sendA2uiAction(action: { name: string; surfaceId: string; sourceComponentId: string; timestamp: string; context: Record<string, unknown> }): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("Dropping a2ui.action: WebSocket is not open", action);
      return;
    }

    const envelope = {
      type: "a2ui.action",
      data: {
        message: {
          version: "v0.9" as const,
          action,
        },
        client_data_model: this.a2ui.getClientDataModel(),
        client_capabilities: this.a2ui.getClientCapabilities(),
      },
    };

    try {
      ws.send(JSON.stringify(envelope));
    } catch (error) {
      console.error("Failed to send a2ui.action", error);
    }
  }

  private async loadTranscript(sessionId: string): Promise<{ messages: ZoeaAgentState["messages"] }> {
    try {
      const response = (await this.client.getMessages(sessionId, "raw")) as ZoeaRawMessagesResponse;
      return { messages: coerceAgentMessages(response.messages || []) };
    } catch {
      const response = (await this.client.getMessages(sessionId, "text")) as ZoeaTextMessagesResponse;
      return { messages: coerceTextMessages(response.messages || []) };
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.state.sessionId) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * this.reconnectAttempts, 5000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectStream();
    }, delay);
  }

  private dispatch(action: ZoeaAction): void {
    this.state = reduceState(this.state, action);
    if (this.state.sessionId) {
      saveSessionSnapshot(this.state.sessionId, {
        messages: this.state.messages,
        model: this.state.model,
        thinkingLevel: this.state.thinkingLevel,
        updatedAt: new Date().toISOString(),
      });
    }
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
