// Theme controller. Two orthogonal axes:
//   - mode    "light" | "dark" | "auto"   (light/dark switcher; auto follows OS)
//   - palette an id from the theme registry (e.g. "default", "lincolnloop", "zoea")
//
// Both persist to localStorage. initTheme() runs from main.ts before paint to
// avoid a flash.

import { applyThemeCss, DEFAULT_THEME_ID, hasTheme } from "./theme-registry";

export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_MODE = "zoea.theme";
const STORAGE_PALETTE = "zoea.palette";
const MODE_EVENT = "zoea-theme-change";
const PALETTE_EVENT = "zoea-palette-change";

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_MODE);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    // localStorage may be unavailable (private mode, SSR, etc.)
  }
  return "auto";
}

function readStoredPalette(): string {
  try {
    const v = localStorage.getItem(STORAGE_PALETTE);
    if (v && hasTheme(v)) return v;
  } catch {
    // ignore
  }
  return DEFAULT_THEME_ID;
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyMode(mode: ThemeMode): void {
  const resolved = resolve(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

let currentMode: ThemeMode = "auto";
let currentPalette: string = DEFAULT_THEME_ID;

export function getTheme(): ThemeMode {
  return currentMode;
}

export function getResolvedTheme(): "light" | "dark" {
  return resolve(currentMode);
}

export function setTheme(mode: ThemeMode): void {
  currentMode = mode;
  try {
    localStorage.setItem(STORAGE_MODE, mode);
  } catch {
    // ignore
  }
  applyMode(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(MODE_EVENT, { detail: mode }));
}

export function onThemeChange(handler: (mode: ThemeMode) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ThemeMode>).detail);
  window.addEventListener(MODE_EVENT, listener);
  return () => window.removeEventListener(MODE_EVENT, listener);
}

export function getPalette(): string {
  return currentPalette;
}

export function setPalette(id: string): void {
  if (!hasTheme(id)) return;
  currentPalette = id;
  try {
    localStorage.setItem(STORAGE_PALETTE, id);
  } catch {
    // ignore
  }
  applyThemeCss(id);
  window.dispatchEvent(new CustomEvent<string>(PALETTE_EVENT, { detail: id }));
}

export function onPaletteChange(handler: (id: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(PALETTE_EVENT, listener);
  return () => window.removeEventListener(PALETTE_EVENT, listener);
}

export function initTheme(): void {
  currentMode = readStoredMode();
  currentPalette = readStoredPalette();
  applyThemeCss(currentPalette);
  applyMode(currentMode);

  // Re-apply when the OS preference flips, but only while in auto mode.
  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  mql?.addEventListener?.("change", () => {
    if (currentMode === "auto") {
      applyMode("auto");
      window.dispatchEvent(new CustomEvent<ThemeMode>(MODE_EVENT, { detail: "auto" }));
    }
  });
}
