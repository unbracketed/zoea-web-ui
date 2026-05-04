// Persistent registry of Zoea server endpoints. The user can add,
// remove, and switch between servers from the UI. The active server's
// HTTP base URL is what the ZoeaClient uses for both REST and WS.

const SERVERS_KEY = "zoea-web-ui.servers";
const ACTIVE_KEY = "zoea-web-ui.activeServerId";

export interface ZoeaServer {
  id: string;
  name: string;
  baseUrl: string;
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
    return parsed.filter(
      (s): s is ZoeaServer =>
        s && typeof s.id === "string" && typeof s.name === "string" && typeof s.baseUrl === "string",
    );
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

// On first load, seed with a "Default" entry pointing at the dev
// proxy's compiled-in fallback target (VITE_ZOEA_DEV_PROXY_TARGET, or
// http://localhost:14004). The user can add more servers from the
// picker; each entry's baseUrl is sent as a per-request hint to the
// dev proxy, so requests always go through the page origin and the
// proxy decides where to forward. CORS is never a concern.
export function getServers(): ZoeaServer[] {
  let servers = readServers();
  if (servers.length === 0) {
    const fallback =
      typeof __ZOEA_DEFAULT_PROXY_TARGET__ === "string" && __ZOEA_DEFAULT_PROXY_TARGET__
        ? __ZOEA_DEFAULT_PROXY_TARGET__
        : "http://localhost:14004";
    servers = [{ id: generateId(), name: "Default", baseUrl: stripTrailingSlash(fallback) }];
    writeServers(servers);
  }
  return servers;
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

export function addServer(name: string, baseUrl: string): ZoeaServer {
  const trimmedName = name.trim();
  const cleanedUrl = stripTrailingSlash(baseUrl.trim());
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
  const server: ZoeaServer = { id: generateId(), name: trimmedName, baseUrl: cleanedUrl };
  servers.push(server);
  writeServers(servers);
  return server;
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
  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    setActiveServer(next[0].id);
  }
  return servers.find((s) => s.id === id)!;
}
