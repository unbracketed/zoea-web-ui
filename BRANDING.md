# Branding & theming

This UI is a reference implementation meant to be re-skinned per brand without
forking component code. All brand-specific surfaces live in two files plus
`/public/brand/`. Touch nothing else when re-skinning.

## The three override surfaces

| Surface | What it controls |
|---|---|
| `src/brand/theme.css`     | Colors, typography, radius, shadows, density — every design token |
| `src/brand/brand.config.ts` | Product name, copy strings, logo + favicon URLs |
| `public/brand/`           | Logo, favicon, any other brand assets referenced by `brand.config.ts` |

`main.ts` imports both at startup and applies them: `theme.css` overrides the
upstream design tokens; `brand.config.ts` sets `document.title` and (if set)
the favicon, and is read by components for visible copy.

## Tokens

The base token set comes from `@mariozechner/mini-lit` (shadcn-style):
`--background`, `--foreground`, `--primary`, `--secondary`, `--card`,
`--border`, `--muted-foreground`, `--accent`, `--destructive`, `--ring`,
`--radius`, `--font-sans`, `--font-serif`, `--font-mono`, plus chart and
sidebar variants. Both `:root` (light) and `.dark` are defined upstream.

Zoea adds these on top in `theme.css`:

| Token | Used by |
|---|---|
| `--success` | connection-badge "open", form submitted state |
| `--warning` | connection-badge "connecting"/"reconnecting" |
| `--user-message-gradient`, `--user-message-border` | the user-message pill rendered by `pi-web-ui` |

To re-skin, override any subset in `theme.css`:

```css
:root {
  --primary: oklch(0.55 0.22 263);
  --radius: 0.375rem;
  --font-sans: "Geist", system-ui, sans-serif;
}
.dark { --primary: oklch(0.7 0.18 263); }
```

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
  theme.css
  brand.config.ts
public/brand/
  logo.svg
  favicon.svg
```

Wire it via a Vite alias or a build-time copy step. Upstream changes rebase
trivially because brands never touch component code.
