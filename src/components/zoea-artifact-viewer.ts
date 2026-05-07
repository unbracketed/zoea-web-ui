import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ZoeaArtifact } from "../adapter/actions";

type ViewerKind = "image" | "pdf" | "text" | "markdown" | "json" | "download";

function classify(mediaType?: string): ViewerKind {
  if (!mediaType) return "download";
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType.startsWith("text/markdown")) return "markdown";
  if (mediaType === "application/json") return "json";
  if (mediaType.startsWith("text/")) return "text";
  return "download";
}

const TEXT_FETCH_LIMIT = 2 * 1024 * 1024;

@customElement("zoea-artifact-viewer")
export class ZoeaArtifactViewer extends LitElement {
  @property({ attribute: false }) artifact?: ZoeaArtifact;
  @state() private textBody: string | null = null;
  @state() private textError: string | null = null;
  @state() private loading = false;

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", this.onKeydown);
    void this.maybeLoadText();
  }

  override disconnectedCallback(): void {
    document.removeEventListener("keydown", this.onKeydown);
    super.disconnectedCallback();
  }

  private onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.close();
    }
  };

  private close() {
    this.remove();
  }

  private async maybeLoadText() {
    if (!this.artifact) return;
    const kind = classify(this.artifact.mediaType);
    if (kind !== "text" && kind !== "markdown" && kind !== "json") return;
    if (this.artifact.bytes > TEXT_FETCH_LIMIT) {
      this.textError = `File is ${this.artifact.bytes} bytes — too large to preview.`;
      return;
    }
    this.loading = true;
    try {
      const response = await fetch(this.artifact.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.textBody = await response.text();
    } catch (error) {
      this.textError = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }

  private renderBody(): TemplateResult | typeof nothing {
    const artifact = this.artifact;
    if (!artifact) return nothing;
    const kind = classify(artifact.mediaType);
    if (this.loading) {
      return html`<div class="zoea-artifact-viewer__loading">Loading…</div>`;
    }
    if (this.textError && (kind === "text" || kind === "markdown" || kind === "json")) {
      return html`<div class="zoea-artifact-viewer__error">${this.textError}</div>`;
    }
    switch (kind) {
      case "image":
        return html`<img class="zoea-artifact-viewer__image" src=${artifact.url} alt=${artifact.name} />`;
      case "pdf":
        return html`<iframe
          class="zoea-artifact-viewer__pdf"
          src=${artifact.url}
          title=${artifact.name}
        ></iframe>`;
      case "json":
        return html`<pre class="zoea-artifact-viewer__pre">${this.textBody ?? ""}</pre>`;
      case "markdown":
      case "text":
        return html`<pre class="zoea-artifact-viewer__pre">${this.textBody ?? ""}</pre>`;
      case "download":
      default:
        return html`<div class="zoea-artifact-viewer__download">
          <p>${artifact.mediaType ?? "Unknown type"} — preview not supported.</p>
          <a class="zoea-artifact-viewer__download-link" href=${artifact.url} download=${artifact.name}>
            Download ${artifact.name}
          </a>
        </div>`;
    }
  }

  override render() {
    const artifact = this.artifact;
    if (!artifact) return nothing;
    return html`
      <div
        class="zoea-artifact-viewer__backdrop"
        role="dialog"
        aria-modal="true"
        @click=${(event: MouseEvent) => {
          if (event.target === event.currentTarget) this.close();
        }}
      >
        <div class="zoea-artifact-viewer__modal">
          <header class="zoea-artifact-viewer__header">
            <span class="zoea-artifact-viewer__title">${artifact.name}</span>
            <a class="zoea-artifact-viewer__action" href=${artifact.url} download=${artifact.name}>Download</a>
            <button type="button" class="zoea-artifact-viewer__close" @click=${() => this.close()} aria-label="Close">
              ×
            </button>
          </header>
          <div class="zoea-artifact-viewer__body">${this.renderBody()}</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "zoea-artifact-viewer": ZoeaArtifactViewer;
  }
}
