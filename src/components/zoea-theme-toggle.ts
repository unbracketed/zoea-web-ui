import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  getPalette,
  getTheme,
  onPaletteChange,
  onThemeChange,
  setPalette,
  setTheme,
  type ThemeMode,
} from "../theme/theme-controller";
import { listThemes, type ThemeMeta } from "../theme/theme-registry";

const MODES: ThemeMode[] = ["light", "dark", "auto"];

const ICON: Record<ThemeMode, string> = {
  light: "☀",
  dark: "☾",
  auto: "◐",
};

const LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

@customElement("zoea-theme-toggle")
export class ZoeaThemeToggle extends LitElement {
  @state() private mode: ThemeMode = getTheme();
  @state() private palette: string = getPalette();
  @state() private menuOpen = false;

  private unsubMode?: () => void;
  private unsubPalette?: () => void;
  private themes: ThemeMeta[] = listThemes();

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.mode = getTheme();
    this.palette = getPalette();
    this.unsubMode = onThemeChange((m) => {
      this.mode = m;
    });
    this.unsubPalette = onPaletteChange((p) => {
      this.palette = p;
    });
    document.addEventListener("click", this.onDocClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubMode?.();
    this.unsubPalette?.();
    document.removeEventListener("click", this.onDocClick);
  }

  private onDocClick = (e: MouseEvent) => {
    if (!this.menuOpen) return;
    if (!(e.target instanceof Node)) return;
    if (this.contains(e.target)) return;
    this.menuOpen = false;
  };

  private cycleMode = () => {
    const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    setTheme(next);
  };

  private toggleMenu = () => {
    this.menuOpen = !this.menuOpen;
  };

  private pick = (id: string) => {
    setPalette(id);
    this.menuOpen = false;
  };

  private renderSwatch(theme: ThemeMeta) {
    const preview = this.mode === "dark" ? theme.previewDark : theme.previewLight;
    if (!preview) {
      return html`<span class="zoea-theme-toggle__swatch zoea-theme-toggle__swatch--empty"></span>`;
    }
    const style = `background:
      linear-gradient(135deg,
        ${preview.background} 0% 33%,
        ${preview.primary} 33% 66%,
        ${preview.accent} 66% 100%);`;
    return html`<span class="zoea-theme-toggle__swatch" style=${style}></span>`;
  }

  override render() {
    const activeTheme = this.themes.find((t) => t.id === this.palette);
    const activeLabel = activeTheme?.label ?? this.palette;

    return html`
      <button
        class="zoea-theme-toggle__mode"
        type="button"
        @click=${this.cycleMode}
        title="Mode: ${LABEL[this.mode]} (click to cycle)"
        aria-label="Toggle light/dark mode, currently ${LABEL[this.mode]}"
      >
        <span class="zoea-theme-toggle__icon" aria-hidden="true">${ICON[this.mode]}</span>
        <span class="zoea-theme-toggle__label">${LABEL[this.mode]}</span>
      </button>
      <div class="zoea-theme-toggle__picker">
        <button
          class="zoea-theme-toggle__trigger"
          type="button"
          @click=${this.toggleMenu}
          aria-haspopup="listbox"
          aria-expanded=${this.menuOpen}
          title="Theme: ${activeLabel}"
        >
          ${activeTheme ? this.renderSwatch(activeTheme) : ""}
          <span class="zoea-theme-toggle__label">${activeLabel}</span>
          <span class="zoea-theme-toggle__caret" aria-hidden="true">▾</span>
        </button>
        ${this.menuOpen
          ? html`
              <div class="zoea-theme-toggle__menu" role="listbox">
                ${this.themes.map(
                  (t) => html`
                    <button
                      type="button"
                      role="option"
                      aria-selected=${t.id === this.palette}
                      class=${`zoea-theme-toggle__item${
                        t.id === this.palette ? " is-active" : ""
                      }`}
                      @click=${() => this.pick(t.id)}
                    >
                      ${this.renderSwatch(t)}
                      <span class="zoea-theme-toggle__item-label">${t.label}</span>
                    </button>
                  `,
                )}
              </div>
            `
          : ""}
      </div>
    `;
  }
}
