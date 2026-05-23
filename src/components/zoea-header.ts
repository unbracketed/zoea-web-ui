import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ConnectionStatus } from "../adapter/actions";
import { brand } from "../brand/brand.config";
import type { ZoeaServer } from "../storage/server-registry";
import "./zoea-server-picker";

@customElement("zoea-header")
export class ZoeaHeader extends LitElement {
  @property() sessionId?: string;
  @property() userId = "";
  @property() connection: ConnectionStatus = "idle";
  @property({ type: Array }) servers: ZoeaServer[] = [];
  @property() activeServerId = "";
  @property({ attribute: false }) onSelectServer?: (id: string) => void | Promise<void>;
  @property({ attribute: false }) onAddServer?: (
    name: string,
    baseUrl: string,
    apiKey: string | undefined,
  ) => void | Promise<void>;
  @property({ attribute: false }) onRemoveServer?: (id: string) => void | Promise<void>;
  @property({ attribute: false }) onEditApiKey?: (id: string) => void | Promise<void>;
  @property({ attribute: false }) onOpenSettings?: () => void;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    const label = brand.copy.connection[this.connection] ?? brand.copy.connection.idle;

    return html`
      <header class="zoea-header">
        <div class="zoea-header__title">
          ${brand.logoUrl
            ? html`<img class="zoea-header__logo" src=${brand.logoUrl} alt=${brand.shortName} />`
            : ""}
          <h1>${brand.productName}</h1>
          <div class="zoea-header__meta">
            ${brand.copy.headerUserPrefix} ${this.userId || "-"}
            ${this.sessionId
              ? html`&nbsp;•&nbsp;${brand.copy.headerSessionPrefix} <code>${this.sessionId}</code>`
              : ""}
          </div>
        </div>
        <div class="zoea-header__actions">
          <zoea-server-picker
            .servers=${this.servers}
            .activeServerId=${this.activeServerId}
            .onSelectServer=${this.onSelectServer}
            .onAddServer=${this.onAddServer}
            .onRemoveServer=${this.onRemoveServer}
            .onEditApiKey=${this.onEditApiKey}
          ></zoea-server-picker>
          <connection-badge .status=${this.connection} .label=${label}></connection-badge>
          <button
            class="zoea-header__settings"
            type="button"
            aria-label="Open settings"
            title="Settings"
            @click=${() => this.onOpenSettings?.()}
          >
            ⚙
          </button>
        </div>
      </header>
    `;
  }
}
