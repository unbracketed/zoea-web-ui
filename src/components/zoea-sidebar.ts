import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { brand } from "../brand/brand.config";
import type { ZoeaSessionListItem } from "../api/zoea-types";

export interface ZoeaSidebarSession extends ZoeaSessionListItem {
  preview?: string;
}

@customElement("zoea-sidebar")
export class ZoeaSidebar extends LitElement {
  @property({ type: Array }) sessions: ZoeaSidebarSession[] = [];
  @property() activeSessionId?: string;
  @property({ type: Boolean }) loading = false;
  @property({ attribute: false }) onSelect?: (sessionId: string) => void | Promise<void>;
  @property({ attribute: false }) onNewSession?: () => void | Promise<void>;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render() {
    return html`
      <aside class="zoea-sidebar">
        <div class="zoea-sidebar__header">
          <div>
            <div class="zoea-sidebar__title">${brand.copy.sidebarTitle}</div>
            <div class="zoea-sidebar__subtitle">${brand.copy.sidebarSubtitle}</div>
          </div>
          <button class="zoea-sidebar__new" @click=${() => this.onNewSession?.()}>
            ${brand.copy.sidebarNewSession}
          </button>
        </div>

        <div class="zoea-sidebar__list">
          ${this.loading ? html`<div class="zoea-sidebar__empty">${brand.copy.sidebarLoading}</div>` : ""}
          ${!this.loading && this.sessions.length === 0 ? html`<div class="zoea-sidebar__empty">${brand.copy.sidebarEmpty}</div>` : ""}
          ${this.sessions.map(
            (session) => html`
              <button
                class="zoea-sidebar__item ${session.session_id === this.activeSessionId ? "is-active" : ""}"
                @click=${() => this.onSelect?.(session.session_id)}
              >
                <div class="zoea-sidebar__item-title">${session.preview || session.session_id}</div>
                <div class="zoea-sidebar__item-meta">
                  <span>${session.session_id}</span>
                  <span>•</span>
                  <span>${new Date(session.last_active_at).toLocaleString()}</span>
                </div>
              </button>
            `,
          )}
        </div>
      </aside>
    `;
  }
}
