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

export function getSessionPreview(sessionId: string): string | undefined {
  const snapshot = loadSessionSnapshot(sessionId);
  const firstUserMessage = snapshot?.messages.find((message) => message.role === "user" || message.role === "user-with-attachments");
  if (!firstUserMessage) {
    return undefined;
  }

  const content = firstUserMessage.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((item: any) => item?.type === "text").map((item: any) => item.text || "").join(" ")
      : "";

  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length <= 48 ? trimmed : `${trimmed.slice(0, 45)}...`;
}
