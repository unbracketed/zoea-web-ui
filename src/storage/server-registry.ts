// Persistent registry of Zoea server endpoints. The user can add,
// remove, and switch between servers from the UI. The active server's
// HTTP base URL is what the ZoeaClient uses for both REST and WS.

const SERVERS_KEY = "zoea-web-ui.servers";
const ACTIVE_KEY = "zoea-web-ui.activeServerId";
const LAST_SESSION_KEY_PREFIX = "zoea-web-ui.lastSessionId.";

export interface ZoeaServer {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readServers(): ZoeaServer[] {
  try {
    const raw = window.localStorage.getItem(SERVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is ZoeaServer =>
          s && typeof s.id === "string" && typeof s.name === "string" && typeof s.baseUrl === "string",
      )
      .map((s) => (typeof s.apiKey === "string" && s.apiKey ? s : { ...s, apiKey: undefined }));
  } catch {
    return [];
  }
}

function writeServers(servers: ZoeaServer[]): void {
  window.localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
}

function generateId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// On first load, seed with a "Default" entry. In a deployed build
// (where Vite isn't proxying) the natural default is the page origin —
// nginx serves both the SPA and the API under the same hostname, so an
// empty baseUrl (interpreted as "same-origin") is what we want. In dev
// (Vite serving on :5173), default to the compiled-in proxy target so
// requests get forwarded to the local zoea-server. Each entry's baseUrl
// is sent as a per-request hint to the dev proxy, so requests always
// go through the page origin and the proxy decides where to forward.
// CORS is never a concern.
export function getServers(): ZoeaServer[] {
  let servers = readServers();
  if (servers.length === 0) {
    const seed = defaultSeedBaseUrl();
    servers = [{ id: generateId(), name: "Default", baseUrl: seed }];
    writeServers(servers);
  }
  return servers;
}

function defaultSeedBaseUrl(): string {
  // import.meta.env.DEV is true under `vite dev`, false in `vite build`.
  if (import.meta.env.DEV) {
    const fallback =
      typeof __ZOEA_DEFAULT_PROXY_TARGET__ === "string" && __ZOEA_DEFAULT_PROXY_TARGET__
        ? __ZOEA_DEFAULT_PROXY_TARGET__
        : "http://localhost:14004";
    return stripTrailingSlash(fallback);
  }
  // Deployed SPA: nginx fronts both the UI and the API under the same
  // origin, so calling the page origin is correct.
  return stripTrailingSlash(window.location.origin);
}

export function getActiveServer(): ZoeaServer {
  const servers = getServers();
  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  const found = activeId ? servers.find((s) => s.id === activeId) : undefined;
  if (found) return found;
  setActiveServer(servers[0].id);
  return servers[0];
}

export function setActiveServer(id: string): void {
  window.localStorage.setItem(ACTIVE_KEY, id);
}

export function addServer(name: string, baseUrl: string, apiKey?: string): ZoeaServer {
  const trimmedName = name.trim();
  const cleanedUrl = stripTrailingSlash(baseUrl.trim());
  const cleanedKey = apiKey?.trim() || undefined;
  if (!trimmedName) {
    throw new Error("Server name is required");
  }
  if (!cleanedUrl) {
    throw new Error("Server URL is required");
  }
  try {
    new URL(cleanedUrl);
  } catch {
    throw new Error(`Invalid server URL: ${cleanedUrl}`);
  }
  const servers = getServers();
  const server: ZoeaServer = {
    id: generateId(),
    name: trimmedName,
    baseUrl: cleanedUrl,
    apiKey: cleanedKey,
  };
  servers.push(server);
  writeServers(servers);
  return server;
}

// Persist (or clear) the API key for an existing server. Returns the
// updated server entry, or null if the id was not found.
export function setServerApiKey(id: string, apiKey: string | undefined): ZoeaServer | null {
  const servers = getServers();
  const idx = servers.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const cleaned = apiKey?.trim() || undefined;
  const updated: ZoeaServer = { ...servers[idx], apiKey: cleaned };
  servers[idx] = updated;
  writeServers(servers);
  return updated;
}

export function removeServer(id: string): ZoeaServer {
  const servers = getServers();
  if (servers.length <= 1) {
    throw new Error("At least one server must remain");
  }
  const next = servers.filter((s) => s.id !== id);
  if (next.length === servers.length) {
    throw new Error("Server not found");
  }
  writeServers(next);
  clearLastSessionId(id);
  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    setActiveServer(next[0].id);
  }
  return servers.find((s) => s.id === id)!;
}

// Per-server last-used session id. Used to keep each server's chat
// state distinct when the user toggles between gateways: switching
// from A to B and back lands on the session that was active in A
// (instead of spawning a fresh one each time). Server-scoped because
// session ids are not portable across gateways.
export function getLastSessionId(serverId: string): string | null {
  try {
    return window.localStorage.getItem(`${LAST_SESSION_KEY_PREFIX}${serverId}`);
  } catch {
    return null;
  }
}

export function setLastSessionId(serverId: string, sessionId: string): void {
  try {
    window.localStorage.setItem(`${LAST_SESSION_KEY_PREFIX}${serverId}`, sessionId);
  } catch {
    // Ignore quota errors.
  }
}

export function clearLastSessionId(serverId: string): void {
  try {
    window.localStorage.removeItem(`${LAST_SESSION_KEY_PREFIX}${serverId}`);
  } catch {
    // Ignore.
  }
}
