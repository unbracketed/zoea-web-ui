// Theme controller. Three modes: "light", "dark", "auto" (follow system).
// Persists to localStorage and toggles `.dark` on <html>, which is the hook
// the brand theme tokens key off of.
//
// initTheme() runs from main.ts before paint to avoid a flash. The toggle
// component subscribes via addEventListener on the controller's bus.

export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "zoea.theme";
const EVENT = "zoea-theme-change";

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    // localStorage may be unavailable (private mode, SSR, etc.)
  }
  return "auto";
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function apply(mode: ThemeMode): void {
  const resolved = resolve(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

let currentMode: ThemeMode = "auto";

export function getTheme(): ThemeMode {
  return currentMode;
}

export function getResolvedTheme(): "light" | "dark" {
  return resolve(currentMode);
}

export function setTheme(mode: ThemeMode): void {
  currentMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  apply(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT, { detail: mode }));
}

export function onThemeChange(handler: (mode: ThemeMode) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ThemeMode>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function initTheme(): void {
  currentMode = readStored();
  apply(currentMode);

  // Re-apply when the OS preference flips, but only while in auto mode.
  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  mql?.addEventListener?.("change", () => {
    if (currentMode === "auto") {
      apply("auto");
      window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT, { detail: "auto" }));
    }
  });
}
