import { ZoeaClient, type ZoeaClientOptions, type ZoeaListSessionsOptions } from "../api/zoea-client";
import type {
  A2uiBatchEventData,
  A2uiSnapshotEventData,
  A2uiSubmissionEventData,
  ZoeaGatewayEvent,
  ZoeaListSessionsResponse,
  ZoeaRawMessagesResponse,
  ZoeaServerInfo,
  ZoeaTextMessagesResponse,
  ZoeaToolExecEndData,
} from "../api/zoea-types";
import type { A2uiClientAction } from "@a2ui/web_core/v0_9";
import { loadSessionSnapshot, saveSessionSnapshot } from "../storage/session-cache";
import { A2uiSessionController } from "../a2ui/a2ui-session-controller";
import {
  createInitialState,
  type A2uiFormMessage,
  type ZoeaAction,
  type ZoeaAgentState,
} from "./actions";
import { coerceAgentMessages, coerceTextMessages } from "./message-builders";
import { reduceState } from "./reducer";
import { extractArtifactsFromResult, extractArtifactsFromTranscript } from "./artifact-extract";

export interface ZoeaAgentAdapterOptions extends ZoeaClientOptions {
  userId: string;
  projectId?: string;
}

// ZoeaClientOptions now exposes only proxyTarget; the dev server
// always proxies same-origin requests to that upstream.


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
    this.a2ui = new A2uiSessionController(
      (action) => {
        this.handleA2uiAction(action);
      },
      {
        onSurfaceCreated: (surfaceId, messageId) => {
          this.dispatch({ type: "a2ui.surface.created", surfaceId, messageId });
        },
        onSurfaceDeleted: (surfaceId) => {
          this.dispatch({ type: "a2ui.surface.deleted", surfaceId });
        },
      },
    );
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

    // Resume is idempotent: spawns a Pi process if the session has no
    // live handle (e.g. after a server restart), no-ops if one already
    // exists. Without this step, hydrate() 404s for any session the
    // user clicks from the sidebar that wasn't created in the current
    // server lifetime.
    await this.client.resumeSession(sessionId);

    await this.hydrate();
    await this.connectStream();
  }

  async hydrate(): Promise<void> {
    if (!this.state.sessionId) {
      throw new Error("No session attached");
    }

    const sessionId = this.state.sessionId;
    const [stateResponse, transcript] = await Promise.all([
      this.client.getSessionState(sessionId),
      this.loadTranscript(sessionId),
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

    // Tool-result messages in Pi's raw transcript carry the extension's
    // details payload, which is where artifact metadata lives. Walk the
    // hydrated transcript so resumed sessions show their artifact pills.
    const rawTranscript = transcript.rawMessages ?? transcript.messages;
    const rows = extractArtifactsFromTranscript(rawTranscript, sessionId);
    if (rows.length > 0) {
      this.dispatch({ type: "artifacts.rehydrate", rows });
    }
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

  async getServerInfo(): Promise<ZoeaServerInfo> {
    return this.client.getServerInfo();
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
      const groups = Array.isArray(data.groups) ? data.groups : undefined;
      this.a2ui.applySnapshot(
        typeof data.seq === "number" ? data.seq : undefined,
        messages,
        groups,
      );
      // Apply persisted submissions before rebuilding form messages so
      // each rehydrated entry can render in its closed state.
      const submissions = Array.isArray(data.submissions) ? data.submissions : [];
      for (const sub of submissions) {
        if (!sub.surface_id) continue;
        this.a2ui.applySubmission({
          surfaceId: sub.surface_id,
          messageId: sub.message_id || "",
          actionName: sub.action_name,
          status: sub.status === "cancelled" ? "cancelled" : "submitted",
          values: sub.values as Record<string, unknown> | undefined,
          at: sub.at,
        });
      }
      this.dispatch({
        type: "a2ui.snapshot.received",
        seq: this.a2ui.getSeq(),
        surfaceIds: this.a2ui.getSurfaceIds(),
        messageIds: this.a2ui.getMessageIdsWithSurfaces(),
      });
      this.rehydrateFormMessages();
      return;
    }

    if (event.type === "agent.a2ui") {
      const data = (event.data || {}) as A2uiBatchEventData;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      this.a2ui.applyBatch(
        typeof data.seq === "number" ? data.seq : undefined,
        messages,
        data.message_id,
      );
      this.dispatch({
        type: "a2ui.batch.received",
        seq: this.a2ui.getSeq(),
        surfaceIds: this.a2ui.getSurfaceIds(),
        messageIds: this.a2ui.getMessageIdsWithSurfaces(),
      });
      return;
    }

    if (event.type === "agent.a2ui.submission") {
      const data = (event.data || {}) as A2uiSubmissionEventData;
      if (!data.surface_id) return;
      const status = data.status === "cancelled" ? "cancelled" : "submitted";
      this.a2ui.applySubmission({
        surfaceId: data.surface_id,
        messageId: data.message_id || "",
        actionName: data.action_name,
        status,
        values: data.values as Record<string, unknown> | undefined,
        at: data.at,
      });
      this.dispatch({
        type: "a2ui.surface.submitted",
        surfaceId: data.surface_id,
        messageId: data.message_id || "",
        action: data.action_name,
        values: data.values as Record<string, unknown> | undefined,
        status,
        at: data.at,
      });
      return;
    }

    this.dispatch({ type: "gateway.event", event });

    if (event.type === "agent.tool.end") {
      const data = (event.data || {}) as ZoeaToolExecEndData;
      const sessionId = this.state.sessionId;
      if (data.tool_call_id && sessionId) {
        const artifacts = extractArtifactsFromResult(data.result, data.tool_call_id, sessionId);
        if (artifacts.length > 0) {
          this.dispatch({
            type: "artifacts.attach",
            toolCallId: data.tool_call_id,
            artifacts,
          });
        }
      }
    }
  }

  // Rebuilds synthetic a2uiForm chat-list entries from the
  // controller's current state — used after snapshot replay so the
  // timeline ordering converges to one canonical view. Surfaces with
  // no message_id (true orphans) are skipped here; the orphan side
  // panel still handles them.
  private rehydrateFormMessages(): void {
    const entries: A2uiFormMessage[] = [];
    for (const surfaceId of this.a2ui.getSurfaceIds()) {
      const messageId = this.findMessageIdForSurface(surfaceId);
      if (!messageId) continue;
      const sub = this.a2ui.getSubmission(surfaceId);
      entries.push({
        role: "a2uiForm",
        surfaceId,
        messageId,
        anchorAfterMessageId: messageId,
        status: sub?.status ?? "pending",
        submittedValues: sub?.values,
        submittedAction: sub?.actionName,
        submittedAt: sub?.at,
        createdAt: sub?.at ?? new Date().toISOString(),
      });
    }
    if (entries.length > 0) {
      this.dispatch({ type: "a2ui.surfaces.rehydrate", entries });
    }
  }

  // handleA2uiAction is the single entry point invoked by the A2UI lit
  // controller when a user interacts with a surface. We treat the
  // action as a chat-channel submission (A2UI agent-development guide
  // flow): it becomes a user-turn prompt to the agent and an
  // optimistic user message in the chat timeline. The legacy
  // a2ui.action relay envelope is also emitted so existing server-side
  // observers keep working — the server's
  // a2ui.submit handler synthesises one as well, so both paths land.
  private handleA2uiAction(action: A2uiClientAction): void {
    this.sendA2uiSubmit(action);
    this.sendA2uiActionRelay(action);
  }

  private sendA2uiSubmit(action: A2uiClientAction): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("Dropping a2ui.submit: WebSocket is not open", action);
      return;
    }

    const messageID = this.findMessageIdForSurface(action.surfaceId);
    // The A2UI lit controller reports `action.context` as the *button
    // metadata* (e.g. {action_id: "submit"}) — NOT the form's input
    // values. The actual user-entered data lives in the per-surface
    // client data model. We merge both: data-model values take
    // precedence (real user inputs), action.context is folded in for
    // any button-only metadata. Without this the agent receives an
    // empty form and replies "no answer came through".
    const surfaceInputs = this.collectSurfaceInputs(action.surfaceId);
    const values: Record<string, unknown> = {
      ...(action.context || {}),
      ...surfaceInputs,
    };
    const humanText = this.summariseSubmission(action, values);
    const envelope = {
      type: "a2ui.submit" as const,
      data: {
        message_id: messageID,
        surface_id: action.surfaceId,
        action_name: action.name,
        text: humanText,
        values,
      },
    };

    try {
      ws.send(JSON.stringify(envelope));
    } catch (error) {
      console.error("Failed to send a2ui.submit", error);
      return;
    }

    // Optimistic local update so the form bubble flips to "submitted"
    // immediately, before the server's broadcast lands. The server
    // event will arrive moments later and confirm/overwrite this.
    const status: "submitted" | "cancelled" =
      action.name && /cancel|dismiss|close/i.test(action.name) ? "cancelled" : "submitted";
    const at = new Date().toISOString();
    this.a2ui.applySubmission({
      surfaceId: action.surfaceId,
      messageId: messageID || "",
      actionName: action.name,
      status,
      values,
      at,
    });
    this.dispatch({
      type: "a2ui.surface.submitted",
      surfaceId: action.surfaceId,
      messageId: messageID || "",
      action: action.name,
      values,
      status,
      at,
    });
  }

  private sendA2uiActionRelay(action: A2uiClientAction): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
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
      console.error("Failed to send a2ui.action relay", error);
    }
  }

  private findMessageIdForSurface(surfaceId: string): string | undefined {
    for (const messageId of this.a2ui.getMessageIdsWithSurfaces()) {
      const surfaces = this.a2ui.getSurfacesForMessage(messageId);
      if (surfaces.some((entry) => entry.id === surfaceId)) {
        return messageId;
      }
    }
    return undefined;
  }

  // Pulls the user-entered inputs for one surface out of the A2UI
  // client data model. Shape per A2uiClientDataModelSchema:
  //   {version: "v0.9", surfaces: {<surfaceId>: {<inputId>: value, ...}}}
  // Returns {} when the surface has no sendDataModel or hasn't
  // collected any inputs yet (e.g. user clicked submit on an empty
  // form) — that's a valid state, the agent decides how to react.
  private collectSurfaceInputs(surfaceId: string): Record<string, unknown> {
    const dm = this.a2ui.getClientDataModel() as
      | { surfaces?: Record<string, Record<string, unknown>> }
      | undefined;
    const surfaces = dm?.surfaces;
    if (!surfaces) return {};
    const inputs = surfaces[surfaceId];
    return inputs && typeof inputs === "object" ? { ...inputs } : {};
  }

  private summariseSubmission(action: A2uiClientAction, values: Record<string, unknown>): string {
    if (!values || Object.keys(values).length === 0) {
      return action.name ? `(${action.name})` : "(submitted)";
    }
    const parts: string[] = [];
    for (const [k, v] of Object.entries(values)) {
      if (v == null) continue;
      const display = typeof v === "string" ? v : JSON.stringify(v);
      parts.push(`${k}: ${display}`);
      if (parts.join(", ").length > 200) break;
    }
    const summary = parts.join(", ");
    return summary || (action.name ? `(${action.name})` : "(submitted)");
  }

  private async loadTranscript(
    sessionId: string,
  ): Promise<{ messages: ZoeaAgentState["messages"]; rawMessages?: unknown[] }> {
    try {
      const response = (await this.client.getMessages(sessionId, "raw")) as ZoeaRawMessagesResponse;
      const raw = response.messages || [];
      return { messages: coerceAgentMessages(raw), rawMessages: raw };
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
