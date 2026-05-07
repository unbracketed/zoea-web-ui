// Theme discovery + injection.
//
// Themes live at src/brand/themes/theme.<id>.css. Each file scopes its
// custom properties to `[data-theme="<id>"]` (and `[data-theme="<id>"].dark`
// for dark-mode overrides), so multiple themes can ship together and we
// switch by toggling `<html data-theme="...">`.
//
// We use Vite's import.meta.glob with `?raw` to enumerate the CSS source at
// build time and inject the active theme's text into a single <style> tag.
// This keeps the system "drop a file in, it shows up" without runtime fs
// access.
//
// Optional metadata is parsed from a comment block at the top of each CSS
// file using simple @directives:
//   @theme         human-readable label (defaults to a Title-Cased id)
//   @preview-light three space-separated hex previews (bg, primary, accent)
//   @preview-dark  same for dark mode
//
// See theme.lincolnloop.css for an example.

const THEME_FILES = import.meta.glob("../brand/themes/theme.*.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface ThemePreview {
  background: string;
  primary: string;
  accent: string;
}

export interface ThemeMeta {
  id: string;
  label: string;
  previewLight?: ThemePreview;
  previewDark?: ThemePreview;
}

interface DiscoveredTheme extends ThemeMeta {
  css: string;
}

function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function parsePreview(line: string): ThemePreview | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return undefined;
  const [background, primary, accent] = parts;
  return { background, primary, accent };
}

function parseMeta(id: string, css: string): ThemeMeta {
  const meta: ThemeMeta = { id, label: titleCase(id) };
  // Only scan the first comment block — the metadata is always at the top.
  const headerMatch = css.match(/\/\*([\s\S]*?)\*\//);
  if (!headerMatch) return meta;
  const header = headerMatch[1];

  const labelMatch = header.match(/@theme\s+(.+)/);
  if (labelMatch) meta.label = labelMatch[1].trim();

  const lightMatch = header.match(/@preview-light\s+(.+)/);
  if (lightMatch) meta.previewLight = parsePreview(lightMatch[1]);

  const darkMatch = header.match(/@preview-dark\s+(.+)/);
  if (darkMatch) meta.previewDark = parsePreview(darkMatch[1]);

  return meta;
}

function buildRegistry(): Record<string, DiscoveredTheme> {
  const out: Record<string, DiscoveredTheme> = {};
  for (const [path, css] of Object.entries(THEME_FILES)) {
    const filename = path.split("/").pop() || "";
    const idMatch = filename.match(/^theme\.(.+)\.css$/);
    if (!idMatch) continue;
    const id = idMatch[1];
    out[id] = { css, ...parseMeta(id, css) };
  }
  return out;
}

const REGISTRY = buildRegistry();

export const DEFAULT_THEME_ID = "default";

export function listThemes(): ThemeMeta[] {
  // Keep "default" first if present, then alphabetical by label.
  const all = Object.values(REGISTRY).map(({ css: _css, ...meta }) => meta);
  return all.sort((a, b) => {
    if (a.id === DEFAULT_THEME_ID) return -1;
    if (b.id === DEFAULT_THEME_ID) return 1;
    return a.label.localeCompare(b.label);
  });
}

export function hasTheme(id: string): boolean {
  return id in REGISTRY;
}

const STYLE_ID = "zoea-active-theme";

export function applyThemeCss(id: string): void {
  const theme = REGISTRY[id] ?? REGISTRY[DEFAULT_THEME_ID];
  if (!theme) return;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    // Insert at the end of <head> so it wins the cascade against app.css and
    // upstream pi-web-ui tokens.
    document.head.appendChild(style);
  }
  style.textContent = theme.css;
  document.documentElement.dataset.theme = theme.id;
}
