import "@mariozechner/pi-web-ui";
import "@a2ui/lit/v0_9";
import { html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { selectToolResultsById, selectVisibleMessages } from "../adapter/selectors";
import type { A2uiFormMessage, ArtifactsRowMessage, ChatListMessage, ZoeaAgentState } from "../adapter/actions";
import type { A2uiSessionController } from "../a2ui/a2ui-session-controller";
import type { StreamingMessageContainer } from "@mariozechner/pi-web-ui";
import type { AgentMessage } from "@mariozechner/pi-web-ui";
import type { ZoeaSidebarSession } from "./zoea-sidebar";
import type { ZoeaServer } from "../storage/server-registry";
import type { ZoeaCommandInfo } from "../api/zoea-types";
import "./zoea-a2ui-panel";
import "./zoea-a2ui-form-message";
import "./zoea-artifact-row";

@customElement("zoea-chat-view")
export class ZoeaChatView extends LitElement {
  @property({ attribute: false }) state!: ZoeaAgentState;
  @property({ attribute: false }) a2uiController?: A2uiSessionController;
  @property({ type: Array }) sessions: ZoeaSidebarSession[] = [];
  @property({ type: Boolean }) sessionsLoading = false;
  @property({ type: Array }) servers: ZoeaServer[] = [];
  @property() activeServerId = "";
  @property({ type: Array }) commands: ZoeaCommandInfo[] = [];
  @property({ attribute: false }) onSend?: (text: string) => void | Promise<void>;
  @property({ attribute: false }) onAbort?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectSession?: (sessionId: string) => void | Promise<void>;
  @property({ attribute: false }) onNewSession?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectServer?: (id: string) => void | Promise<void>;
  @property({ attribute: false }) onAddServer?: (
    name: string,
    baseUrl: string,
    apiKey: string | undefined,
  ) => void | Promise<void>;
  @property({ attribute: false }) onRemoveServer?: (id: string) => void | Promise<void>;
  @property({ attribute: false }) onEditApiKey?: (id: string) => void | Promise<void>;
  @property({ attribute: false }) onOpenSettings?: () => void;

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

  // Splits the chat list into runs of real AgentMessages and runs of
  // synthetic a2uiForm entries. Real messages render via <message-list>;
  // form entries render via <zoea-a2ui-form-message>. This is what
  // makes A2UI forms appear as first-class items in the timeline that
  // scroll with chat, persist across reload, and carry their own
  // pending → submitted/cancelled state.
  private buildChatSegments(messages: ChatListMessage[]): Array<
    | { kind: "messages"; messages: AgentMessage[] }
    | { kind: "form"; form: A2uiFormMessage }
    | { kind: "artifacts"; row: ArtifactsRowMessage }
  > {
    const segments: Array<
      | { kind: "messages"; messages: AgentMessage[] }
      | { kind: "form"; form: A2uiFormMessage }
      | { kind: "artifacts"; row: ArtifactsRowMessage }
    > = [];
    if (messages.length === 0) {
      return segments;
    }
    let buffer: AgentMessage[] = [];
    const flush = () => {
      if (buffer.length > 0) {
        segments.push({ kind: "messages", messages: buffer });
        buffer = [];
      }
    };
    for (const message of messages) {
      if (message.role === "a2uiForm") {
        flush();
        segments.push({ kind: "form", form: message });
        continue;
      }
      if (message.role === "zoeaArtifacts") {
        flush();
        segments.push({ kind: "artifacts", row: message });
        continue;
      }
      buffer.push(message);
    }
    flush();
    return segments;
  }

  private renderSegments(messages: ChatListMessage[]) {
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
      if (segment.kind === "artifacts") {
        return html`<zoea-artifact-row .artifacts=${segment.row.artifacts}></zoea-artifact-row>`;
      }
      return html`<zoea-a2ui-form-message
        .controller=${this.a2uiController}
        .form=${segment.form}
      ></zoea-a2ui-form-message>`;
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
            .servers=${this.servers}
            .activeServerId=${this.activeServerId}
            .onSelectServer=${this.onSelectServer}
            .onAddServer=${this.onAddServer}
            .onRemoveServer=${this.onRemoveServer}
            .onEditApiKey=${this.onEditApiKey}
            .onOpenSettings=${this.onOpenSettings}
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
            .commands=${this.commands}
            .onSend=${this.onSend}
            .onAbort=${this.onAbort}
          ></zoea-composer>
        </div>
      </div>
    `;
  }
}
