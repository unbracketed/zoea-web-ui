import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getTheme, onThemeChange, setTheme, type ThemeMode } from "../theme/theme-controller";

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

  private unsubscribe?: () => void;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.mode = getTheme();
    this.unsubscribe = onThemeChange((m) => {
      this.mode = m;
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private cycle = () => {
    const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    setTheme(next);
  };

  override render() {
    return html`
      <button
        class="zoea-theme-toggle"
        type="button"
        @click=${this.cycle}
        title="Theme: ${LABEL[this.mode]} (click to cycle)"
        aria-label="Toggle theme, currently ${LABEL[this.mode]}"
      >
        <span class="zoea-theme-toggle__icon" aria-hidden="true">${ICON[this.mode]}</span>
        <span class="zoea-theme-toggle__label">${LABEL[this.mode]}</span>
      </button>
    `;
  }
}
