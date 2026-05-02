import "@mariozechner/pi-web-ui";
import "@a2ui/lit/v0_9";
import { html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { selectToolResultsById, selectVisibleMessages } from "../adapter/selectors";
import type { ZoeaAgentState } from "../adapter/actions";
import type { A2uiSessionController, A2uiSurfaceEntry } from "../a2ui/a2ui-session-controller";
import type { StreamingMessageContainer } from "@mariozechner/pi-web-ui";
import type { AgentMessage } from "@mariozechner/pi-web-ui";
import type { ZoeaSidebarSession } from "./zoea-sidebar";
import "./zoea-a2ui-panel";

@customElement("zoea-chat-view")
export class ZoeaChatView extends LitElement {
  @property({ attribute: false }) state!: ZoeaAgentState;
  @property({ attribute: false }) a2uiController?: A2uiSessionController;
  @property({ type: Array }) sessions: ZoeaSidebarSession[] = [];
  @property({ type: Boolean }) sessionsLoading = false;
  @property({ attribute: false }) onSend?: (text: string) => void | Promise<void>;
  @property({ attribute: false }) onAbort?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectSession?: (sessionId: string) => void | Promise<void>;
  @property({ attribute: false }) onNewSession?: () => void | Promise<void>;

  // Bumped whenever the controller's surfaces change so we re-render
  // the chat segments. We don't read controller-internal state directly
  // here, but we do depend on it for getSurfacesForMessage below.
  @state() private a2uiTick = 0;

  @query("streaming-message-container") private streamingContainer?: StreamingMessageContainer;
  @query(".zoea-messages") private scrollContainer?: HTMLDivElement;

  private unsubscribeController?: () => void;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribeController?.();
    this.unsubscribeController = undefined;
  }

  protected override willUpdate(changedProperties: PropertyValues<this>): void {
    super.willUpdate(changedProperties);
    if (changedProperties.has("a2uiController")) {
      this.unsubscribeController?.();
      this.unsubscribeController = undefined;
      if (this.a2uiController) {
        this.unsubscribeController = this.a2uiController.subscribe(() => {
          this.a2uiTick++;
        });
      }
    }
  }

  protected override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    if (this.streamingContainer) {
      this.streamingContainer.setMessage(this.state.streamingMessage, !this.state.isStreaming);
    }

    if (this.scrollContainer && (changedProperties.has("state") || changedProperties.size > 0)) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  // Splits the message list around assistant messages that own A2UI
  // surfaces, returning alternating message-segment / surface-block
  // entries. This is what makes the rendered surface appear *inline*
  // with the agent's message bubble in the chat scroll, matching the
  // A2UI agent-development guide flow ("the agent outputs text and a
  // JSON list of A2UI messages — the client renders both into the
  // chat timeline together").
  private buildChatSegments(messages: AgentMessage[]): Array<
    | { kind: "messages"; messages: AgentMessage[] }
    | { kind: "surfaces"; messageId: string; surfaces: A2uiSurfaceEntry[] }
  > {
    const segments: Array<
      | { kind: "messages"; messages: AgentMessage[] }
      | { kind: "surfaces"; messageId: string; surfaces: A2uiSurfaceEntry[] }
    > = [];
    if (!this.a2uiController || messages.length === 0) {
      return [{ kind: "messages", messages }];
    }
    const ownerSet = new Set(this.state.a2uiMessageIds);
    let buffer: AgentMessage[] = [];
    const flush = () => {
      if (buffer.length > 0) {
        segments.push({ kind: "messages", messages: buffer });
        buffer = [];
      }
    };
    for (const message of messages) {
      buffer.push(message);
      if (message.role !== "assistant") continue;
      const responseId = message.responseId;
      if (!responseId || !ownerSet.has(responseId)) continue;
      const surfaces = this.a2uiController.getSurfacesForMessage(responseId);
      if (surfaces.length === 0) continue;
      flush();
      segments.push({ kind: "surfaces", messageId: responseId, surfaces });
    }
    flush();
    return segments;
  }

  private renderSegments(messages: AgentMessage[]) {
    const segments = this.buildChatSegments(messages);
    return segments.map((segment) => {
      if (segment.kind === "messages") {
        return html`<message-list
          .messages=${segment.messages}
          .tools=${[]}
          .pendingToolCalls=${this.state.pendingToolCalls}
          .isStreaming=${this.state.isStreaming}
        ></message-list>`;
      }
      return html`<div class="zoea-a2ui-inline" data-message-id=${segment.messageId}>
        ${segment.surfaces.map(
          (entry) => html`<a2ui-surface .surface=${entry.surface}></a2ui-surface>`,
        )}
      </div>`;
    });
  }

  private renderOrphanPanel() {
    if (!this.a2uiController) {
      return nothing;
    }
    const orphans = this.a2uiController.getOrphanSurfaces();
    if (orphans.length === 0) {
      return nothing;
    }
    return html`<zoea-a2ui-panel .controller=${this.a2uiController}></zoea-a2ui-panel>`;
  }

  override render() {
    const messages = selectVisibleMessages(this.state);
    const toolResultsById = selectToolResultsById(this.state);

    return html`
      <div class="zoea-shell">
        <zoea-sidebar
          .sessions=${this.sessions}
          .activeSessionId=${this.state.sessionId}
          .loading=${this.sessionsLoading}
          .onSelect=${this.onSelectSession}
          .onNewSession=${this.onNewSession}
        ></zoea-sidebar>

        <div class="zoea-main">
          <zoea-header
            .sessionId=${this.state.sessionId}
            .userId=${this.state.userId}
            .connection=${this.state.connection}
          ></zoea-header>

          <div class="zoea-messages">
            <div class="zoea-messages__inner">
              ${this.renderSegments(messages)}

              <streaming-message-container
                class=${this.state.isStreaming ? "" : "hidden"}
                .tools=${[]}
                .isStreaming=${this.state.isStreaming}
                .pendingToolCalls=${this.state.pendingToolCalls}
                .toolResultsById=${toolResultsById}
              ></streaming-message-container>
            </div>
          </div>

          ${this.renderOrphanPanel()}

          <zoea-composer
            .isStreaming=${this.state.isStreaming}
            .onSend=${this.onSend}
            .onAbort=${this.onAbort}
          ></zoea-composer>
        </div>
      </div>
    `;
  }
}
