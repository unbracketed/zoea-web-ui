import "@a2ui/lit/v0_9";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { A2uiSessionController, A2uiSurfaceEntry } from "../a2ui/a2ui-session-controller";
import type { A2uiFormMessage } from "../adapter/actions";

@customElement("zoea-a2ui-form-message")
export class ZoeaA2uiFormMessage extends LitElement {
  @property({ attribute: false }) controller?: A2uiSessionController;
  @property({ attribute: false }) form!: A2uiFormMessage;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    if (!this.controller || !this.form) {
      return nothing;
    }
    const status = this.form.status;
    if (status === "pending") {
      return this.renderPending();
    }
    return this.renderClosed(status);
  }

  private renderPending() {
    const surfaces = this.controller!.getSurfacesForMessage(this.form.messageId);
    const entry = surfaces.find((s) => s.id === this.form.surfaceId);
    if (!entry) {
      // Surface might not be wired yet (race); render a placeholder.
      return html`<div class="zoea-a2ui-form-message zoea-a2ui-form-message--pending">
        <header class="zoea-a2ui-form-message__header">Form</header>
        <div class="zoea-a2ui-form-message__body zoea-a2ui-form-message__placeholder">
          Loading…
        </div>
      </div>`;
    }
    return html`<div class="zoea-a2ui-form-message zoea-a2ui-form-message--pending">
      <header class="zoea-a2ui-form-message__header">
        <span class="zoea-a2ui-form-message__pill">Awaiting your input</span>
      </header>
      <div class="zoea-a2ui-form-message__body">
        ${this.renderSurface(entry)}
      </div>
    </div>`;
  }

  private renderSurface(entry: A2uiSurfaceEntry) {
    return html`<a2ui-surface .surface=${entry.surface}></a2ui-surface>`;
  }

  private renderClosed(status: "submitted" | "cancelled") {
    const values = this.form.submittedValues || {};
    const isCancelled = status === "cancelled";
    const label = isCancelled ? "Cancelled" : "Submitted";
    const cls = isCancelled
      ? "zoea-a2ui-form-message zoea-a2ui-form-message--cancelled"
      : "zoea-a2ui-form-message zoea-a2ui-form-message--submitted";
    return html`<div class=${cls}>
      <header class="zoea-a2ui-form-message__header">
        <span class="zoea-a2ui-form-message__pill">${label}</span>
        ${this.form.submittedAction
          ? html`<span class="zoea-a2ui-form-message__action">action: ${this.form.submittedAction}</span>`
          : nothing}
      </header>
      <div class="zoea-a2ui-form-message__body">
        ${this.renderValues(values)}
      </div>
    </div>`;
  }

  private renderValues(values: Record<string, unknown>) {
    const entries = Object.entries(values).filter(([k]) => k !== "action_id");
    if (entries.length === 0) {
      return html`<div class="zoea-a2ui-form-message__empty">(no values)</div>`;
    }
    return html`<dl class="zoea-a2ui-form-message__values">
      ${entries.map(
        ([k, v]) => html`
          <dt>${k}</dt>
          <dd>${this.formatValue(v)}</dd>
        `,
      )}
    </dl>`;
  }

  private formatValue(value: unknown): string {
    if (value == null) return "—";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((v) => this.formatValue(v)).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
}
