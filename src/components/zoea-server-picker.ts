import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { brand } from "../brand/brand.config";
import type { ZoeaServer } from "../storage/server-registry";

@customElement("zoea-server-picker")
export class ZoeaServerPicker extends LitElement {
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

  @state() private menuOpen = false;
  @state() private adding = false;
  @state() private newName = "";
  @state() private newUrl = "";
  @state() private newApiKey = "";

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.handleDocumentClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this.handleDocumentClick);
  }

  private handleDocumentClick = (event: MouseEvent) => {
    if (!this.menuOpen) return;
    const target = event.target as Node | null;
    if (target && this.contains(target)) return;
    this.closeMenu();
  };

  private toggleMenu = (event: Event) => {
    event.stopPropagation();
    if (this.menuOpen) {
      this.closeMenu();
    } else {
      this.menuOpen = true;
    }
  };

  private closeMenu = () => {
    this.menuOpen = false;
    this.adding = false;
    this.newName = "";
    this.newUrl = "";
    this.newApiKey = "";
  };

  private handleSelect = async (id: string, event: Event) => {
    event.stopPropagation();
    this.closeMenu();
    await this.onSelectServer?.(id);
  };

  private handleRemove = async (id: string, event: Event) => {
    event.stopPropagation();
    if (!confirm("Remove this server from the list?")) return;
    await this.onRemoveServer?.(id);
  };

  private handleStartAdd = (event: Event) => {
    event.stopPropagation();
    this.adding = true;
  };

  private handleCancelAdd = (event: Event) => {
    event.stopPropagation();
    this.adding = false;
    this.newName = "";
    this.newUrl = "";
    this.newApiKey = "";
  };

  private handleSubmitAdd = async (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    const name = this.newName.trim();
    const url = this.newUrl.trim();
    const apiKey = this.newApiKey.trim() || undefined;
    if (!name || !url) return;
    this.closeMenu();
    await this.onAddServer?.(name, url, apiKey);
  };

  private handleEditKey = async (id: string, event: Event) => {
    event.stopPropagation();
    this.closeMenu();
    await this.onEditApiKey?.(id);
  };

  private renderServerLabel(server: ZoeaServer): string {
    return server.baseUrl || "(page origin)";
  }

  override render() {
    const active = this.servers.find((s) => s.id === this.activeServerId) ?? this.servers[0];
    if (!active) return nothing;

    return html`
      <div class="zoea-server-picker">
        <button class="zoea-server-picker__trigger" type="button" @click=${this.toggleMenu}>
          <span class="zoea-server-picker__trigger-label">${active.name}</span>
          <span class="zoea-server-picker__trigger-url">${this.renderServerLabel(active)}</span>
          <span class="zoea-server-picker__caret">▾</span>
        </button>
        ${this.menuOpen
          ? html`
              <div class="zoea-server-picker__menu" @click=${(e: Event) => e.stopPropagation()}>
                <div class="zoea-server-picker__menu-section">
                  ${this.servers.map(
                    (server) => html`
                      <div
                        class="zoea-server-picker__item ${server.id === this.activeServerId
                          ? "is-active"
                          : ""}"
                      >
                        <button
                          class="zoea-server-picker__item-main"
                          type="button"
                          @click=${(e: Event) => this.handleSelect(server.id, e)}
                        >
                          <span class="zoea-server-picker__item-name">${server.name}</span>
                          <span class="zoea-server-picker__item-url">
                            ${this.renderServerLabel(server)}
                          </span>
                        </button>
                        <button
                          class="zoea-server-picker__item-remove"
                          type="button"
                          title=${server.apiKey ? "Update API key" : "Set API key"}
                          @click=${(e: Event) => this.handleEditKey(server.id, e)}
                        >
                          ${server.apiKey ? "🔑" : "🔓"}
                        </button>
                        ${this.servers.length > 1
                          ? html`
                              <button
                                class="zoea-server-picker__item-remove"
                                type="button"
                                title="Remove"
                                @click=${(e: Event) => this.handleRemove(server.id, e)}
                              >
                                ×
                              </button>
                            `
                          : nothing}
                      </div>
                    `,
                  )}
                </div>

                <div class="zoea-server-picker__menu-divider"></div>

                ${this.adding
                  ? html`
                      <form class="zoea-server-picker__add-form" @submit=${this.handleSubmitAdd}>
                        <input
                          class="zoea-server-picker__input"
                          type="text"
                          placeholder=${brand.copy.serverPickerNamePlaceholder}
                          .value=${this.newName}
                          @input=${(e: Event) =>
                            (this.newName = (e.target as HTMLInputElement).value)}
                          autofocus
                        />
                        <input
                          class="zoea-server-picker__input"
                          type="text"
                          placeholder=${brand.copy.serverPickerUrlPlaceholder}
                          .value=${this.newUrl}
                          @input=${(e: Event) =>
                            (this.newUrl = (e.target as HTMLInputElement).value)}
                        />
                        <input
                          class="zoea-server-picker__input"
                          type="password"
                          placeholder="API key (optional)"
                          autocomplete="off"
                          .value=${this.newApiKey}
                          @input=${(e: Event) =>
                            (this.newApiKey = (e.target as HTMLInputElement).value)}
                        />
                        <div class="zoea-server-picker__add-actions">
                          <button
                            class="zoea-server-picker__button"
                            type="button"
                            @click=${this.handleCancelAdd}
                          >
                            ${brand.copy.serverPickerCancel}
                          </button>
                          <button class="zoea-server-picker__button is-primary" type="submit">
                            ${brand.copy.serverPickerSubmit}
                          </button>
                        </div>
                      </form>
                    `
                  : html`
                      <button
                        class="zoea-server-picker__add"
                        type="button"
                        @click=${this.handleStartAdd}
                      >
                        ${brand.copy.serverPickerAdd}
                      </button>
                    `}
              </div>
            `
          : nothing}
      </div>
    `;
  }
}
