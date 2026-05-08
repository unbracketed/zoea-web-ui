import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { zoeaConfig } from "../config";
import { ZoeaAgentAdapter } from "../adapter/zoea-agent-adapter";
import { createInitialState, type ZoeaAgentState } from "../adapter/actions";
import { getSessionPreview } from "../storage/session-cache";
import {
  addServer,
  getActiveServer,
  getLastSessionId,
  getServers,
  removeServer,
  setActiveServer,
  setLastSessionId,
  type ZoeaServer,
} from "../storage/server-registry";
import type { ZoeaCommandInfo, ZoeaSessionListItem } from "../api/zoea-types";
import type { ZoeaSidebarSession } from "./zoea-sidebar";
import "./connection-badge";
import "./zoea-chat-view";
import "./zoea-composer";
import "./zoea-header";
import "./zoea-server-picker";
import "./zoea-sidebar";

@customElement("zoea-app")
export class ZoeaApp extends LitElement {
  @state() private appState: ZoeaAgentState = createInitialState(zoeaConfig.defaultUserId, zoeaConfig.defaultProjectId || undefined);
  @state() private uiError?: string;
  @state() private sessions: ZoeaSidebarSession[] = [];
  @state() private sessionsLoading = false;
  @state() private serverWorkingDir = "";
  @state() private servers: ZoeaServer[] = getServers();
  @state() private activeServer: ZoeaServer = getActiveServer();
  @state() private commands: ZoeaCommandInfo[] = [];

  private adapter!: ZoeaAgentAdapter;
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
    this.createAdapter();
    void this.boot();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.adapter?.destroy();
  }

  private createAdapter(): void {
    // The browser always talks to the page origin; the dev proxy reads
    // the active server's baseUrl from a per-request hint and forwards
    // there. Empty means "use the dev proxy's compiled-in fallback".
    this.adapter = new ZoeaAgentAdapter({
      userId: zoeaConfig.defaultUserId,
      projectId: zoeaConfig.defaultProjectId || undefined,
      proxyTarget: this.activeServer.baseUrl || undefined,
    });
    this.unsubscribe = this.adapter.subscribe((state) => {
      this.appState = state;
    });
  }

  private async boot() {
    try {
      await this.discoverWorkingDir();
      await this.discoverServerConfig();

      const url = new URL(window.location.href);
      const existingSessionId = url.searchParams.get("session");

      if (existingSessionId) {
        try {
          await this.adapter.attachSession(existingSessionId);
          this.rememberSessionForActiveServer(existingSessionId);
          await this.refreshSessions();
          return;
        } catch (error) {
          // The cached session no longer exists on this server (e.g.
          // it was created on a different gateway, or has been pruned).
          // Drop the stale URL hint and fall through to a new session
          // so the user lands somewhere usable instead of an error.
          console.warn("Failed to attach cached session; starting new", error);
          this.clearSessionUrl();
        }
      }

      await this.startNewSession();
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  }

  private rememberSessionForActiveServer(sessionId: string): void {
    setLastSessionId(this.activeServer.id, sessionId);
  }

  private async discoverWorkingDir(): Promise<void> {
    // Discover the server's effective working-dir so the sidebar can
    // be scoped to "sessions for this server's cwd". A failure here
    // is non-fatal — the sidebar just falls back to showing all
    // sessions for this user.
    try {
      const info = await this.adapter.getServerInfo();
      this.serverWorkingDir = info.ZOEA_WORKING_DIR || "";
    } catch {
      this.serverWorkingDir = "";
    }
  }

  private async discoverServerConfig(): Promise<void> {
    // Pulls Pi's registered slash commands so the composer can
    // autocomplete them. Server-instance-scoped under the v1 assumption
    // that one server uses one working dir for all sessions, so we only
    // fetch once per app load. Failure leaves commands empty — composer
    // degrades to a plain editor.
    try {
      const cfg = await this.adapter.getServerConfig();
      this.commands = cfg.available ? cfg.commands : [];
    } catch {
      this.commands = [];
    }
  }

  private updateSessionUrl(sessionId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState({}, "", url);
  }

  private clearSessionUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("session");
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
    this.rememberSessionForActiveServer(sessionId);
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
      this.rememberSessionForActiveServer(sessionId);
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

  private handleSelectServer = async (id: string) => {
    if (id === this.activeServer.id) return;
    const next = this.servers.find((s) => s.id === id);
    if (!next) return;
    this.stashCurrentSessionForOutgoingServer();
    setActiveServer(id);
    this.activeServer = next;
    await this.switchActiveServer();
  };

  private handleAddServer = async (name: string, baseUrl: string) => {
    this.uiError = undefined;
    try {
      this.stashCurrentSessionForOutgoingServer();
      const server = addServer(name, baseUrl);
      this.servers = getServers();
      setActiveServer(server.id);
      this.activeServer = server;
      await this.switchActiveServer();
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  };

  private handleRemoveServer = async (id: string) => {
    this.uiError = undefined;
    try {
      const wasActive = id === this.activeServer.id;
      removeServer(id);
      this.servers = getServers();
      if (wasActive) {
        this.activeServer = getActiveServer();
        await this.switchActiveServer();
      }
    } catch (error) {
      this.uiError = error instanceof Error ? error.message : String(error);
    }
  };

  // Captures the session currently visible in the chat so that a later
  // switch back to this server resumes where the user left off. Must be
  // called before activeServer is reassigned.
  private stashCurrentSessionForOutgoingServer(): void {
    const sessionId = this.appState.sessionId;
    if (sessionId) {
      setLastSessionId(this.activeServer.id, sessionId);
    }
  }

  // Swaps to whatever activeServer is currently set to: tear down the
  // current adapter, drop any session state from the old server (since
  // session ids are server-scoped), spin up a fresh adapter, and
  // re-run the boot flow so working-dir + sessions reload. If the
  // incoming server has a remembered session id, prime the URL with it
  // so boot() resumes that session instead of creating a new one.
  private async switchActiveServer(): Promise<void> {
    this.uiError = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.adapter?.destroy();

    this.appState = createInitialState(zoeaConfig.defaultUserId, zoeaConfig.defaultProjectId || undefined);
    this.sessions = [];
    this.serverWorkingDir = "";

    const remembered = getLastSessionId(this.activeServer.id);
    if (remembered) {
      this.updateSessionUrl(remembered);
    } else {
      this.clearSessionUrl();
    }

    this.createAdapter();
    await this.boot();
  }

  override render() {
    const error = this.uiError || this.appState.lastError;

    return html`
      ${error ? html`<div class="zoea-error-banner">${error}</div>` : ""}
      <zoea-chat-view
        .state=${this.appState}
        .a2uiController=${this.adapter.a2ui}
        .sessions=${this.sessions}
        .sessionsLoading=${this.sessionsLoading}
        .servers=${this.servers}
        .activeServerId=${this.activeServer.id}
        .commands=${this.commands}
        .onSelectSession=${this.openSession}
        .onNewSession=${this.startNewSession}
        .onSend=${this.handleSend}
        .onAbort=${this.handleAbort}
        .onSelectServer=${this.handleSelectServer}
        .onAddServer=${this.handleAddServer}
        .onRemoveServer=${this.handleRemoveServer}
      ></zoea-chat-view>
    `;
  }
}
