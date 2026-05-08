import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ZoeaCommandInfo, ZoeaToolInfo } from "../api/zoea-types";
import "./zoea-theme-toggle";

// Right-side drawer for app settings. Hosts the theme/mode controls and
// the Pi configuration inventory (tools / skills / extension commands /
// prompts) sourced from /v1/config. Kept presentational — open/close
// state and the cached config live in zoea-app so the gear button in
// the header can drive it without prop-drilling through zoea-chat-view.
@customElement("zoea-settings-panel")
export class ZoeaSettingsPanel extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) commands: ZoeaCommandInfo[] = [];
  @property({ type: Array }) tools: ZoeaToolInfo[] = [];
  @property({ type: Boolean }) configAvailable = false;
  @property({ attribute: false }) onClose?: () => void;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      this.onClose?.();
    }
  };

  private handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      this.onClose?.();
    }
  };

  override render() {
    if (!this.open) return nothing;
    return html`
      <div
        class="zoea-settings__backdrop"
        @click=${this.handleBackdropClick}
        role="presentation"
      >
        <aside
          class="zoea-settings__drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <header class="zoea-settings__header">
            <h2 class="zoea-settings__title">Settings</h2>
            <button
              class="zoea-settings__close"
              type="button"
              aria-label="Close settings"
              @click=${() => this.onClose?.()}
            >
              ✕
            </button>
          </header>
          <div class="zoea-settings__body">
            <section class="zoea-settings__section">
              <h3 class="zoea-settings__section-title">Appearance</h3>
              <div class="zoea-settings__row">
                <zoea-theme-toggle></zoea-theme-toggle>
              </div>
            </section>
            ${this.renderInventory()}
          </div>
        </aside>
      </div>
    `;
  }

  private renderInventory(): TemplateResult {
    if (!this.configAvailable) {
      return html`
        <section class="zoea-settings__section">
          <h3 class="zoea-settings__section-title">Pi configuration</h3>
          <p class="zoea-settings__empty">
            Configuration unavailable. The server's boot-time introspection
            either failed or has not run.
          </p>
        </section>
      `;
    }

    const skills = this.commands.filter((c) => c.source === "skill");
    const prompts = this.commands.filter((c) => c.source === "prompt");
    const extCommands = this.commands.filter((c) => c.source === "extension");
    const builtinTools = this.tools.filter((t) => (t.sourceInfo?.source ?? "") === "builtin");
    const extTools = this.tools.filter((t) => (t.sourceInfo?.source ?? "") !== "builtin");

    return html`
      ${this.renderToolsSection("Built-in tools", builtinTools)}
      ${this.renderToolsSection("Extension tools", extTools)}
      ${this.renderCommandsSection("Slash commands", extCommands)}
      ${this.renderCommandsSection("Skills", skills)}
      ${this.renderCommandsSection("Prompts", prompts)}
    `;
  }

  private renderCommandsSection(title: string, commands: ZoeaCommandInfo[]): TemplateResult {
    return html`
      <section class="zoea-settings__section">
        <h3 class="zoea-settings__section-title">
          ${title}
          <span class="zoea-settings__count">${commands.length}</span>
        </h3>
        ${commands.length === 0
          ? html`<p class="zoea-settings__empty">None registered.</p>`
          : html`
              <ul class="zoea-settings__list">
                ${commands.map((cmd) => this.renderCommandItem(cmd))}
              </ul>
            `}
      </section>
    `;
  }

  private renderCommandItem(cmd: ZoeaCommandInfo): TemplateResult {
    const scope = cmd.sourceInfo?.scope;
    return html`
      <li class="zoea-settings__item">
        <div class="zoea-settings__item-head">
          <code class="zoea-settings__item-name">/${cmd.name}</code>
          ${scope ? html`<span class="zoea-settings__chip">${scope}</span>` : nothing}
        </div>
        ${cmd.description
          ? html`<p class="zoea-settings__item-desc">${cmd.description}</p>`
          : nothing}
        ${cmd.sourceInfo?.path
          ? html`<p class="zoea-settings__item-path" title=${cmd.sourceInfo.path}>
              ${cmd.sourceInfo.path}
            </p>`
          : nothing}
      </li>
    `;
  }

  private renderToolsSection(title: string, tools: ZoeaToolInfo[]): TemplateResult {
    return html`
      <section class="zoea-settings__section">
        <h3 class="zoea-settings__section-title">
          ${title}
          <span class="zoea-settings__count">${tools.length}</span>
        </h3>
        ${tools.length === 0
          ? html`<p class="zoea-settings__empty">None registered.</p>`
          : html`
              <ul class="zoea-settings__list">
                ${tools.map((tool) => this.renderToolItem(tool))}
              </ul>
            `}
      </section>
    `;
  }

  private renderToolItem(tool: ZoeaToolInfo): TemplateResult {
    const scope = tool.sourceInfo?.scope;
    const path = tool.sourceInfo?.path;
    return html`
      <li class="zoea-settings__item">
        <div class="zoea-settings__item-head">
          <code class="zoea-settings__item-name">${tool.name}</code>
          ${scope ? html`<span class="zoea-settings__chip">${scope}</span>` : nothing}
        </div>
        ${tool.description
          ? html`<p class="zoea-settings__item-desc">${tool.description}</p>`
          : nothing}
        ${path
          ? html`<p class="zoea-settings__item-path" title=${path}>${path}</p>`
          : nothing}
        ${tool.parameters
          ? html`
              <details class="zoea-settings__details">
                <summary>parameters</summary>
                <pre class="zoea-settings__json">${JSON.stringify(tool.parameters, null, 2)}</pre>
              </details>
            `
          : nothing}
      </li>
    `;
  }
}
