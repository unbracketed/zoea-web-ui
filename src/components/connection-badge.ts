import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ConnectionStatus } from "../adapter/actions";

@customElement("connection-badge")
export class ConnectionBadge extends LitElement {
  @property() status: ConnectionStatus = "idle";
  @property() label = "Idle";

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    return html`
      <span class="zoea-connection-badge zoea-connection-badge--${this.status}">
        <span class="zoea-connection-badge__dot"></span>
        <span>${this.label}</span>
      </span>
    `;
  }
}
