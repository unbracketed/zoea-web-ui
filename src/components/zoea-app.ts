import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { zoeaConfig } from "../config";
import { ZoeaAgentAdapter } from "../adapter/zoea-agent-adapter";
import { createInitialState, type ZoeaAgentState } from "../adapter/actions";
import "./connection-badge";
import "./zoea-chat-view";
import "./zoea-composer";
import "./zoea-header";

@customElement("zoea-app")
export class ZoeaApp extends LitElement {
  @state() private appState: ZoeaAgentState = createInitialState(zoeaConfig.defaultUserId, zoeaConfig.defaultProjectId || undefined);
  @state() private uiError?: string;

  private adapter = new ZoeaAgentAdapter({
    userId: zoeaConfig.defaultUserId,
    projectId: zoeaConfig.defaultProjectId || undefined,
    apiBaseUrl: zoeaConfig.apiBaseUrl,
    wsBaseUrl: zoeaConfig.wsBaseUrl,
  });

  private unsubscribe?: () => void;
  private booted = false;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.booted) {
      return;
    }
    this.booted = true;
    this.unsubscribe = this.adapter.subscribe((state) => {
      this.appState = state;
    });
    void this.boot();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.adapter.destroy();
  }

  private async boot() {
    try {
      const url = new URL(window.location.href);
      const existingSessionId = url.searchParams.get("session");

      if (existingSessionId) {
        await this.adapter.attachSession(existingSessionId);
        return;
      }

      const sessionId = await this.adapter.createSession();
      this.updateSessionUrl(sessionId);
      await this.adapter.attachSession(sessionId);
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  }

  private updateSessionUrl(sessionId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState({}, "", url);
  }

  private handleSend = async (text: string) => {
    this.uiError = undefined;
    try {
      await this.adapter.prompt(text);
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  };

  private handleAbort = async () => {
    this.uiError = undefined;
    try {
      await this.adapter.abort();
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  };

  override render() {
    const error = this.uiError || this.appState.lastError;

    return html`
      ${error ? html`<div class="zoea-error-banner">${error}</div>` : ""}
      <zoea-chat-view
        .state=${this.appState}
        .onSend=${this.handleSend}
        .onAbort=${this.handleAbort}
      ></zoea-chat-view>
    `;
  }
}
