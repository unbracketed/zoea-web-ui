import "@mariozechner/pi-web-ui";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("zoea-composer")
export class ZoeaComposer extends LitElement {
  @property({ type: Boolean }) isStreaming = false;
  @property({ attribute: false }) onSend?: (text: string) => void | Promise<void>;
  @property({ attribute: false }) onAbort?: () => void | Promise<void>;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private handleSend = async (input: string) => {
    const text = input.trim();
    if (!text) {
      return;
    }
    await this.onSend?.(text);
  };

  override render() {
    return html`
      <div class="zoea-composer">
        <div class="zoea-composer__inner">
          <message-editor
            .isStreaming=${this.isStreaming}
            .showAttachmentButton=${false}
            .showModelSelector=${false}
            .showThinkingSelector=${false}
            .onSend=${(input: string) => this.handleSend(input)}
            .onAbort=${() => this.onAbort?.()}
          ></message-editor>
        </div>
      </div>
    `;
  }
}
