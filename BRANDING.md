# Branding & theming

This UI is a reference implementation meant to be re-skinned per brand without
forking component code. All brand-specific surfaces live in two files plus
`/public/brand/`. Touch nothing else when re-skinning.

## The override surfaces

| Surface | What it controls |
|---|---|
| `src/brand/themes/theme.<id>.css` | A *user-selectable* theme: colors, typography, radius — every design token |
| `src/brand/brand.config.ts`       | Product name, copy strings, logo + favicon URLs (per-deployment, not user-selectable) |
| `public/brand/`                   | Logo, favicon, any other brand assets referenced by `brand.config.ts` |

There are two orthogonal axes:

- **Brand** (per deployment) — `brand.config.ts` plus `public/brand/`. Sets
  `document.title`, the favicon, and the visible copy in the chrome.
- **Theme** (user-selectable at runtime) — palette + typography from any file
  matching `src/brand/themes/theme.*.css`. The header picker enumerates them.
  A separate light/dark/auto switch lives next to the theme picker.

A "Lincoln Loop" deployment can ship with `brand.config.ts` set to its product
name and copy, but still let users pick the Zoea synthwave palette. Themes are
user preference; brand is product identity.

## How theme discovery works

Vite's `import.meta.glob("../brand/themes/theme.*.css", { query: "?raw", eager: true })`
enumerates the CSS at build time. The id is whatever follows `theme.` in the
filename. Each theme's tokens are scoped to `[data-theme="<id>"]` and
`[data-theme="<id>"].dark` so multiple themes can ship together — the
controller toggles `<html data-theme="...">` plus `<html class="dark">`.

To add a new theme, drop one file in `src/brand/themes/`:

```css
/*
 * @theme My Brand
 * @preview-light #ffffff #2563eb #d97706
 * @preview-dark  #0a0a0a #60a5fa #fbbf24
 */
[data-theme="mybrand"] {
  --primary: oklch(0.55 0.22 263);
  --radius: 0.375rem;
  /* override any subset of the token set */
}
[data-theme="mybrand"].dark {
  --primary: oklch(0.7 0.18 263);
}
```

The `@theme` line sets the human-readable label in the picker. The
`@preview-light` and `@preview-dark` lines (three space-separated colors:
background, primary, accent) drive the swatch shown next to each option.

## Tokens

The base token set comes from `@mariozechner/mini-lit` (shadcn-style):
`--background`, `--foreground`, `--primary`, `--secondary`, `--card`,
`--border`, `--muted-foreground`, `--accent`, `--destructive`, `--ring`,
`--radius`, `--font-sans`, `--font-serif`, `--font-mono`, plus chart and
sidebar variants. Both `:root` (light) and `.dark` are defined upstream.

Zoea adds these on top in each `theme.*.css`:

| Token | Used by |
|---|---|
| `--success` | connection-badge "open", form submitted state |
| `--warning` | connection-badge "connecting"/"reconnecting" |
| `--user-message-gradient`, `--user-message-border` | the user-message pill rendered by `pi-web-ui` |

The user-message pill is bound to those tokens once in `app.css` so every
theme picks it up automatically.

## Copy & assets

Edit `brand.config.ts`. Every visible string in the chrome (header, sidebar,
server picker, connection labels) is sourced from `brand.copy.*`. Set
`logoUrl` to render a logo in the header; set `faviconUrl` to override the
favicon at runtime.

```ts
export const brand: BrandConfig = {
  productName: "Acme Console",
  shortName: "Acme",
  logoUrl: "/brand/acme-logo.svg",
  faviconUrl: "/brand/acme-favicon.svg",
  copy: { /* ... */ },
};
```

## What this system does *not* do

- **Layout/structure changes** — components still render the same DOM. Brands
  that need a different chat layout, different navigation, or a marketing-style
  landing screen require a fork.
- **Chat-stream visuals beyond tokens** — the message stream and composer are
  rendered by `@mariozechner/pi-web-ui`. Tokens flow through, but the
  internal structure is not ours. The `.user-message-container` override in
  `theme.css` is the one targeted bleed-through fix; further changes there
  would need to land upstream.
- **Per-brand feature flags** — none yet. Add a `features` field to
  `BrandConfig` if/when needed.

## Adding a new brand (suggested workflow)

Keep one upstream repo. For each brand, maintain a small overlay repo (or a
branch) containing only:

```
brand-overrides/
  themes/theme.<id>.css     # one or more themes
  brand.config.ts
public/brand/
  logo.svg
  favicon.svg
```

Wire it via a Vite alias or a build-time copy step. Upstream changes rebase
trivially because brands never touch component code.

## Persistence

Both the active theme id and the light/dark/auto mode persist to
`localStorage` under `zoea.palette` and `zoea.theme`. The controller applies
them in `initTheme()` (called from `main.ts` before the app element mounts)
to avoid a flash of the wrong colors on reload.
