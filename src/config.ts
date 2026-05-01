function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const storedUserId = typeof window !== "undefined" ? window.localStorage.getItem("zoea.userId") : null;

export const zoeaConfig = {
  apiBaseUrl: stripTrailingSlash(import.meta.env.VITE_ZOEA_BASE_URL ?? ""),
  wsBaseUrl: stripTrailingSlash(import.meta.env.VITE_ZOEA_WS_BASE_URL ?? ""),
  defaultUserId: storedUserId || import.meta.env.VITE_ZOEA_USER_ID || "web-user",
  defaultProjectId: import.meta.env.VITE_ZOEA_PROJECT_ID || "",
};
