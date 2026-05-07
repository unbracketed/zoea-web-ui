import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ZoeaArtifact } from "../adapter/actions";
import "./zoea-artifact-viewer";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mediaType?: string): string {
  if (!mediaType) return "📎";
  if (mediaType.startsWith("image/")) return "🖼";
  if (mediaType === "application/pdf") return "📕";
  if (mediaType.startsWith("text/markdown")) return "📝";
  if (mediaType.startsWith("text/")) return "📄";
  if (mediaType === "application/json") return "{ }";
  return "📎";
}

@customElement("zoea-artifact-row")
export class ZoeaArtifactRow extends LitElement {
  @property({ attribute: false }) artifacts: ZoeaArtifact[] = [];

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private openViewer(artifact: ZoeaArtifact) {
    const viewer = document.createElement("zoea-artifact-viewer");
    viewer.artifact = artifact;
    document.body.appendChild(viewer);
  }

  override render() {
    if (!this.artifacts || this.artifacts.length === 0) return nothing;
    return html`
      <div class="zoea-artifact-row" role="list">
        ${this.artifacts.map(
          (artifact) => html`
            <button
              type="button"
              class="zoea-artifact-pill"
              role="listitem"
              title=${artifact.mediaType
                ? `${artifact.name} · ${artifact.mediaType}`
                : artifact.name}
              @click=${() => this.openViewer(artifact)}
            >
              <span class="zoea-artifact-pill__icon" aria-hidden="true">${iconFor(artifact.mediaType)}</span>
              <span class="zoea-artifact-pill__name">${artifact.name}</span>
              ${artifact.bytes
                ? html`<span class="zoea-artifact-pill__size">${formatBytes(artifact.bytes)}</span>`
                : nothing}
            </button>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "zoea-artifact-row": ZoeaArtifactRow;
  }
}
