import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ConnectionStatus } from "../adapter/actions";

@customElement("zoea-header")
export class ZoeaHeader extends LitElement {
  @property() sessionId?: string;
  @property() userId = "";
  @property() connection: ConnectionStatus = "idle";

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    const label =
      this.connection === "open"
        ? "Connected"
        : this.connection === "connecting"
          ? "Connecting"
          : this.connection === "reconnecting"
            ? "Reconnecting"
            : this.connection === "closed"
              ? "Closed"
              : this.connection === "error"
                ? "Error"
                : "Idle";

    return html`
      <header class="zoea-header">
        <div class="zoea-header__title">
          <h1>Zoea Web UI</h1>
          <div class="zoea-header__meta">
            user: ${this.userId || "-"}
            ${this.sessionId ? html`&nbsp;•&nbsp;session: <code>${this.sessionId}</code>` : ""}
          </div>
        </div>
        <connection-badge .status=${this.connection} .label=${label}></connection-badge>
      </header>
    `;
  }
}
