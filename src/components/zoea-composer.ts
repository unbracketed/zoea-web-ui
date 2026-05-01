import "@mariozechner/pi-web-ui";
import { html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import type { MessageEditor } from "@mariozechner/pi-web-ui";

@customElement("zoea-composer")
export class ZoeaComposer extends LitElement {
  @property({ type: Boolean }) isStreaming = false;
  @property({ attribute: false }) onSend?: (text: string) => void | Promise<void>;
  @property({ attribute: false }) onAbort?: () => void | Promise<void>;

  @query("message-editor") private editor?: MessageEditor;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private handleSend = async (input: string) => {
    const text = input.trim();
    if (!text) {
      return;
    }
    await this.onSend?.(text);
    if (this.editor) {
      this.editor.value = "";
      this.editor.attachments = [];
    }
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
