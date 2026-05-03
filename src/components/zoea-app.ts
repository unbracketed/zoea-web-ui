import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { zoeaConfig } from "../config";
import { ZoeaAgentAdapter } from "../adapter/zoea-agent-adapter";
import { createInitialState, type ZoeaAgentState } from "../adapter/actions";
import { getSessionPreview } from "../storage/session-cache";
import type { ZoeaSessionListItem } from "../api/zoea-types";
import type { ZoeaSidebarSession } from "./zoea-sidebar";
import "./connection-badge";
import "./zoea-chat-view";
import "./zoea-composer";
import "./zoea-header";
import "./zoea-sidebar";

@customElement("zoea-app")
export class ZoeaApp extends LitElement {
  @state() private appState: ZoeaAgentState = createInitialState(zoeaConfig.defaultUserId, zoeaConfig.defaultProjectId || undefined);
  @state() private uiError?: string;
  @state() private sessions: ZoeaSidebarSession[] = [];
  @state() private sessionsLoading = false;
  @state() private serverWorkingDir = "";

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
      // Discover the server's effective working-dir so the sidebar can
      // be scoped to "sessions for this server's cwd". A failure here
      // is non-fatal — the sidebar just falls back to showing all
      // sessions for this user.
      try {
        const info = await this.adapter.getServerInfo();
        this.serverWorkingDir = info.default_working_dir || "";
      } catch {
        this.serverWorkingDir = "";
      }

      const url = new URL(window.location.href);
      const existingSessionId = url.searchParams.get("session");

      if (existingSessionId) {
        await this.adapter.attachSession(existingSessionId);
        await this.refreshSessions();
        return;
      }

      await this.startNewSession();
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  }

  private updateSessionUrl(sessionId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState({}, "", url);
  }

  private decorateSessions(sessions: ZoeaSessionListItem[]): ZoeaSidebarSession[] {
    return sessions.map((session) => ({
      ...session,
      preview: getSessionPreview(session.session_id),
    }));
  }

  private refreshSessions = async () => {
    this.sessionsLoading = true;
    try {
      const response = await this.adapter.listSessions({
        userId: this.appState.userId,
        workingDir: this.serverWorkingDir || undefined,
        limit: 20,
        offset: 0,
      });
      this.sessions = this.decorateSessions(response.sessions);
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    } finally {
      this.sessionsLoading = false;
    }
  };

  private startNewSession = async () => {
    this.uiError = undefined;
    const sessionId = await this.adapter.createSession();
    this.updateSessionUrl(sessionId);
    await this.adapter.attachSession(sessionId);
    await this.refreshSessions();
  };

  private openSession = async (sessionId: string) => {
    if (!sessionId || sessionId === this.appState.sessionId) {
      return;
    }
    this.uiError = undefined;
    try {
      this.updateSessionUrl(sessionId);
      await this.adapter.attachSession(sessionId);
      await this.refreshSessions();
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  };

  private handleSend = async (text: string) => {
    this.uiError = undefined;
    try {
      await this.adapter.prompt(text);
      await this.refreshSessions();
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
        .a2uiController=${this.adapter.a2ui}
        .sessions=${this.sessions}
        .sessionsLoading=${this.sessionsLoading}
        .onSelectSession=${this.openSession}
        .onNewSession=${this.startNewSession}
        .onSend=${this.handleSend}
        .onAbort=${this.handleAbort}
      ></zoea-chat-view>
    `;
  }
}
