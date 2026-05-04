import { defineConfig, loadEnv, type Plugin } from "vite";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { URL } from "node:url";

const PROXY_PREFIXES = ["/v1", "/healthz", "/readyz", "/api"];
const TARGET_HEADER = "x-zoea-target";
const TARGET_QUERY = "zoeaTarget";

function shouldProxy(pathname: string): boolean {
  return PROXY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveTarget(rawTarget: string | string[] | undefined, fallback: string): string {
  const value = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
  const cleaned = stripTrailingSlash((value || "").trim());
  if (!cleaned) return fallback;
  try {
    new URL(cleaned);
    return cleaned;
  } catch {
    return fallback;
  }
}

// stripTargetQueryParam removes our hint param from the URL we forward
// upstream so the upstream server never sees it. Returns the cleaned
// path+query string (no origin).
function stripTargetQueryParam(originalUrl: string): string {
  const url = new URL(originalUrl, "http://placeholder");
  url.searchParams.delete(TARGET_QUERY);
  return `${url.pathname}${url.search}`;
}

function dynamicZoeaProxy(fallbackTarget: string): Plugin {
  return {
    name: "zoea-dynamic-proxy",
    configureServer(server) {
      // REST: intercept matching paths in the connect middleware chain.
      // We read the X-Zoea-Target header on each request, build an
      // outbound http(s) request, and pipe both directions.
      server.middlewares.use((req, res, next) => {
        const url = req.url || "/";
        const pathname = url.split("?")[0];
        if (!shouldProxy(pathname)) {
          return next();
        }

        const target = resolveTarget(req.headers[TARGET_HEADER], fallbackTarget);
        const targetUrl = new URL(target);
        const isHttps = targetUrl.protocol === "https:";
        const lib = isHttps ? https : http;

        // Drop our hint header so it never reaches the upstream.
        const outboundHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
        delete outboundHeaders[TARGET_HEADER];
        outboundHeaders.host = targetUrl.host;

        const outbound = lib.request(
          {
            protocol: targetUrl.protocol,
            hostname: targetUrl.hostname,
            port: targetUrl.port || (isHttps ? 443 : 80),
            method: req.method,
            path: url,
            headers: outboundHeaders,
          },
          (upstream) => {
            res.writeHead(upstream.statusCode || 502, upstream.headers);
            upstream.pipe(res);
          },
        );

        outbound.on("error", (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { "content-type": "application/json" });
          }
          res.end(JSON.stringify({ error: `proxy: ${err.message}`, target }));
        });

        req.pipe(outbound);
      });

      // WebSocket: Vite owns the http server and uses its own 'upgrade'
      // listener for HMR. We add a second listener that handles only our
      // /v1/.../stream upgrades, picking the upstream from the
      // ?zoeaTarget=... query param (browsers can't set custom WS
      // headers). For non-matching paths we no-op so Vite's HMR upgrade
      // handler still runs.
      server.httpServer?.on("upgrade", (req, clientSocket, head) => {
        const url = req.url || "/";
        const pathname = url.split("?")[0];
        if (!shouldProxy(pathname)) {
          return;
        }

        const parsed = new URL(url, "http://placeholder");
        const target = resolveTarget(parsed.searchParams.get(TARGET_QUERY) || undefined, fallbackTarget);
        const targetUrl = new URL(target);
        const isHttps = targetUrl.protocol === "https:";
        const upstreamPort = Number(targetUrl.port || (isHttps ? 443 : 80));
        const upstreamPath = stripTargetQueryParam(url);

        const outboundHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
        outboundHeaders.host = targetUrl.host;

        const upstreamSocket = net.connect(upstreamPort, targetUrl.hostname, () => {
          const headerLines = [`GET ${upstreamPath} HTTP/1.1`];
          for (const [name, value] of Object.entries(outboundHeaders)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) headerLines.push(`${name}: ${v}`);
            } else {
              headerLines.push(`${name}: ${value}`);
            }
          }
          headerLines.push("", "");
          upstreamSocket.write(headerLines.join("\r\n"));
          if (head && head.length) {
            upstreamSocket.write(head);
          }
          upstreamSocket.pipe(clientSocket);
          clientSocket.pipe(upstreamSocket);
        });

        const cleanup = () => {
          upstreamSocket.destroy();
          clientSocket.destroy();
        };
        upstreamSocket.on("error", cleanup);
        clientSocket.on("error", cleanup);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const fallback = stripTrailingSlash(env.VITE_ZOEA_DEV_PROXY_TARGET || "http://localhost:14004");

  return {
    server: {
      port: 5173,
    },
    plugins: [dynamicZoeaProxy(fallback)],
    define: {
      // Surface the dev fallback to the client so the seeded "Default"
      // server entry can show the actual upstream URL instead of an
      // opaque "page origin" label. Build-time only; the picker stores
      // user-added servers in localStorage.
      __ZOEA_DEFAULT_PROXY_TARGET__: JSON.stringify(fallback),
    },
  };
});
