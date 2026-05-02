import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_ZOEA_DEV_PROXY_TARGET || "http://localhost:14004";

  return {
    server: {
      port: 5173,
      proxy: {
        "/healthz": { target, changeOrigin: true },
        "/readyz": { target, changeOrigin: true },
        "/v1": { target, changeOrigin: true, ws: true },
        "/api": { target, changeOrigin: true },
      },
    },
  };
});
