# zoea-web-ui

Scaffold for a browser chat UI backed by `zoea-server`.

## Dev

```bash
cd zoea-web-ui
npm install
npm run dev
```

By default Vite proxies `/v1`, `/healthz`, and `/readyz` to `http://localhost:14004`.

### Useful env vars

- `VITE_ZOEA_BASE_URL` - explicit HTTP base URL for the API
- `VITE_ZOEA_WS_BASE_URL` - explicit WS base URL for session streams
- `VITE_ZOEA_DEV_PROXY_TARGET` - Vite dev proxy target (default `http://localhost:14004`)
- `VITE_ZOEA_USER_ID` - default session user id
- `VITE_ZOEA_PROJECT_ID` - optional default project id
