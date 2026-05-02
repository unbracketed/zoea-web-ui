import "@a2ui/lit/v0_9";
import { html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { A2uiSessionController, A2uiSurfaceEntry } from "../a2ui/a2ui-session-controller";

@customElement("zoea-a2ui-panel")
export class ZoeaA2uiPanel extends LitElement {
  @property({ attribute: false }) controller?: A2uiSessionController;

  @state() private surfaces: A2uiSurfaceEntry[] = [];

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
    if (changedProperties.has("controller")) {
      this.unsubscribeController?.();
      this.unsubscribeController = undefined;
      if (this.controller) {
        const refresh = () => {
          // The panel renders only "orphan" surfaces (no message_id
          // correlation). Surfaces tied to a chat message are rendered
          // inline in the message timeline by zoea-chat-view.
          this.surfaces = this.controller ? this.controller.getOrphanSurfaces() : [];
        };
        refresh();
        this.unsubscribeController = this.controller.subscribe(refresh);
      } else {
        this.surfaces = [];
      }
    }
  }

  override render() {
    if (!this.controller) {
      return nothing;
    }
    if (this.surfaces.length === 0) {
      return nothing;
    }
    return html`
      <section class="zoea-a2ui-panel" aria-label="Agent UI">
        <header class="zoea-a2ui-panel__header">Agent UI</header>
        <div class="zoea-a2ui-panel__body">
          <div class="zoea-a2ui-surface-stack">
            ${this.surfaces.map(
              (entry) => html`<a2ui-surface .surface=${entry.surface}></a2ui-surface>`,
            )}
          </div>
        </div>
      </section>
    `;
  }
}
