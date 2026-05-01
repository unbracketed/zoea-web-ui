import "@mariozechner/pi-web-ui";
import { html, LitElement, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { selectToolResultsById, selectVisibleMessages } from "../adapter/selectors";
import type { ZoeaAgentState } from "../adapter/actions";
import type { StreamingMessageContainer } from "@mariozechner/pi-web-ui";

@customElement("zoea-chat-view")
export class ZoeaChatView extends LitElement {
  @property({ attribute: false }) state!: ZoeaAgentState;
  @property({ attribute: false }) onSend?: (text: string) => void | Promise<void>;
  @property({ attribute: false }) onAbort?: () => void | Promise<void>;

  @query("streaming-message-container") private streamingContainer?: StreamingMessageContainer;
  @query(".zoea-messages") private scrollContainer?: HTMLDivElement;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    if (this.streamingContainer) {
      this.streamingContainer.setMessage(this.state.streamingMessage, !this.state.isStreaming);
    }

    if (changedProperties.has("state") && this.scrollContainer) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  override render() {
    const messages = selectVisibleMessages(this.state);
    const toolResultsById = selectToolResultsById(this.state);

    return html`
      <div class="zoea-shell">
        <zoea-header
          .sessionId=${this.state.sessionId}
          .userId=${this.state.userId}
          .connection=${this.state.connection}
        ></zoea-header>

        <div class="zoea-messages">
          <div class="zoea-messages__inner">
            <message-list
              .messages=${messages}
              .tools=${[]}
              .pendingToolCalls=${this.state.pendingToolCalls}
              .isStreaming=${this.state.isStreaming}
            ></message-list>

            <streaming-message-container
              class=${this.state.isStreaming ? "" : "hidden"}
              .tools=${[]}
              .isStreaming=${this.state.isStreaming}
              .pendingToolCalls=${this.state.pendingToolCalls}
              .toolResultsById=${toolResultsById}
            ></streaming-message-container>
          </div>
        </div>

        <zoea-composer
          .isStreaming=${this.state.isStreaming}
          .onSend=${this.onSend}
          .onAbort=${this.onAbort}
        ></zoea-composer>
      </div>
    `;
  }
}
