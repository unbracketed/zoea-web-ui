import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./zoea-theme-toggle";

// Right-side drawer for app settings. Today it hosts the theme/mode
// controls that previously lived in the header; the same shell will
// later host the Pi config view (tools / skills / commands / prompts).
// Kept presentational — open/close state lives in zoea-app so the gear
// button in the header can drive it without prop-drilling through
// zoea-chat-view.
@customElement("zoea-settings-panel")
export class ZoeaSettingsPanel extends LitElement {
  @property({ type: Boolean }) open = false;
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
          </div>
        </aside>
      </div>
    `;
  }
}
