const storedUserId = typeof window !== "undefined" ? window.localStorage.getItem("zoea.userId") : null;

export const zoeaConfig = {
  defaultUserId: storedUserId || import.meta.env.VITE_ZOEA_USER_ID || "web-user",
  defaultProjectId: import.meta.env.VITE_ZOEA_PROJECT_ID || "",
};
