import type { AgentMessage } from "@mariozechner/pi-web-ui";

const PREFIX = "zoea-web-ui.session.";

export interface SessionSnapshot {
  messages: AgentMessage[];
  model?: string;
  thinkingLevel?: string;
  updatedAt: string;
}

export function loadSessionSnapshot(sessionId: string): SessionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${sessionId}`);
    return raw ? (JSON.parse(raw) as SessionSnapshot) : null;
  } catch {
    return null;
  }
}

export function saveSessionSnapshot(sessionId: string, snapshot: SessionSnapshot): void {
  try {
    window.localStorage.setItem(`${PREFIX}${sessionId}`, JSON.stringify(snapshot));
  } catch {
    // Ignore quota/storage errors in MVP.
  }
}

export function clearSessionSnapshot(sessionId: string): void {
  try {
    window.localStorage.removeItem(`${PREFIX}${sessionId}`);
  } catch {
    // Ignore.
  }
}
