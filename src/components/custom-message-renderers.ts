import { html } from "lit";
import { registerMessageRenderer, type MessageRenderer } from "@mariozechner/pi-web-ui";

// CustomMessage is the role: "custom" entry that Pi extensions can inject
// via pi.sendMessage({ customType, content, display, details }). pi-web-ui
// re-exports the type via its dependency on pi-agent-core, but only the
// MessageRole union is reachable from our installed types — the structural
// fields below match the upstream definition.
interface CustomMessageLike {
  role: "custom";
  customType: string;
  content: string | Array<{ type: "text"; text: string } | { type: "image"; [k: string]: unknown }>;
  display?: boolean;
  details?: unknown;
  timestamp?: number;
}

function flattenContent(content: CustomMessageLike["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter((t) => t.length > 0)
    .join("");
}

// Default renderer for any role: "custom" message. Renders the textual
// content in a readable monospace block, with the customType shown as a
// small badge so the user can tell which extension/command produced it.
// Specific customTypes can be added later as branches off this dispatcher
// without growing the registration surface.
const customRenderer: MessageRenderer = {
  render(message) {
    const m = message as unknown as CustomMessageLike;
    if (m.display === false) {
      // display: false marks introspection / state messages that should
      // never appear in the UI. Returning empty html keeps them invisible
      // without touching the visible-message selector upstream.
      return html``;
    }
    const text = flattenContent(m.content);
    return html`
      <div class="zoea-custom-message" data-custom-type=${m.customType}>
        <div class="zoea-custom-message__badge">${m.customType}</div>
        <pre class="zoea-custom-message__content">${text}</pre>
      </div>
    `;
  },
};

let registered = false;

export function registerCustomMessageRenderers(): void {
  if (registered) return;
  registered = true;
  // The registry is keyed by role, so a single renderer dispatches all
  // role: "custom" messages. Cast through unknown because our installed
  // pi-web-ui types don't export the full AgentMessage union but the
  // runtime accepts "custom" — extensions rely on this.
  registerMessageRenderer("custom" as never, customRenderer as never);
}
