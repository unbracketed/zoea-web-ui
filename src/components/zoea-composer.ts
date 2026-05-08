import "@mariozechner/pi-web-ui";
import { html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { MessageEditor } from "@mariozechner/pi-web-ui";
import type { ZoeaCommandInfo } from "../api/zoea-types";
import {
  applyCommand,
  detectSlashCommand,
  rankCommands,
  type SuggestionState,
} from "./command-suggester";

@customElement("zoea-composer")
export class ZoeaComposer extends LitElement {
  @property({ type: Boolean }) isStreaming = false;
  @property({ type: Array }) commands: ZoeaCommandInfo[] = [];
  @property({ attribute: false }) onSend?: (text: string) => void | Promise<void>;
  @property({ attribute: false }) onAbort?: () => void | Promise<void>;

  @query("message-editor") private editor?: MessageEditor;

  // Suggestion state owned by the composer. `null` means the dropdown
  // is hidden. `selected` indexes into the *current* filtered list, not
  // the master command list.
  @state() private suggestion: SuggestionState | null = null;
  @state() private filtered: ZoeaCommandInfo[] = [];
  @state() private selected = 0;

  private textarea?: HTMLTextAreaElement;
  private boundInput = this.handleInput.bind(this);
  // Keydown is captured *before* MessageEditor's own handler so we can
  // intercept Enter/Tab when the dropdown is open without fighting the
  // built-in send-on-Enter. Capture phase + listener-on-textarea is the
  // simplest way to win that race in light DOM.
  private boundKeyDown = this.handleKeyDown.bind(this);

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override updated(): void {
    // The textarea inside <message-editor> is created by Lit on the
    // editor's first render. We attach lazily on every update — cheap,
    // idempotent, and survives the editor re-rendering its tree.
    const ta = this.editor?.querySelector("textarea") ?? undefined;
    if (ta && ta !== this.textarea) {
      this.detachTextareaListeners();
      this.textarea = ta;
      ta.addEventListener("input", this.boundInput);
      ta.addEventListener("keydown", this.boundKeyDown, true);
      ta.addEventListener("blur", () => this.closeSuggestions());
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detachTextareaListeners();
  }

  private detachTextareaListeners(): void {
    if (!this.textarea) return;
    this.textarea.removeEventListener("input", this.boundInput);
    this.textarea.removeEventListener("keydown", this.boundKeyDown, true);
    this.textarea = undefined;
  }

  private handleInput(): void {
    if (!this.textarea) return;
    const value = this.textarea.value;
    const caret = this.textarea.selectionStart ?? value.length;
    const next = detectSlashCommand(value, caret);
    if (!next || this.commands.length === 0) {
      this.closeSuggestions();
      return;
    }
    const filtered = rankCommands(this.commands, next.query);
    if (filtered.length === 0) {
      this.closeSuggestions();
      return;
    }
    this.suggestion = next;
    this.filtered = filtered;
    if (this.selected >= filtered.length) {
      this.selected = 0;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.suggestion || this.filtered.length === 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        this.selected = (this.selected + 1) % this.filtered.length;
        return;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        this.selected = (this.selected - 1 + this.filtered.length) % this.filtered.length;
        return;
      case "Enter":
      case "Tab": {
        // Accept the highlighted suggestion. Stop propagation so
        // MessageEditor does not also try to send the message.
        event.preventDefault();
        event.stopPropagation();
        this.acceptSuggestion(this.filtered[this.selected]);
        return;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        this.closeSuggestions();
        return;
      default:
        return;
    }
  }

  private acceptSuggestion(cmd: ZoeaCommandInfo): void {
    if (!this.textarea || !this.editor || !this.suggestion) return;
    const result = applyCommand(this.textarea.value, this.suggestion, cmd);
    // Update via the editor's setter so its internal _value stays in
    // sync with the DOM. Then move the caret to the end of the inserted
    // command (after the trailing space).
    this.editor.value = result.text;
    requestAnimationFrame(() => {
      if (!this.textarea) return;
      this.textarea.focus();
      this.textarea.setSelectionRange(result.caret, result.caret);
      // Re-evaluate visibility after caret/text update — typically the
      // trailing space terminates the slash prefix and closes the
      // dropdown, but going through the same input path keeps state
      // consistent.
      this.handleInput();
    });
  }

  private closeSuggestions(): void {
    this.suggestion = null;
    this.filtered = [];
    this.selected = 0;
  }

  private handleSend = async (input: string) => {
    const text = input.trim();
    if (!text) {
      return;
    }
    this.closeSuggestions();
    await this.onSend?.(text);
    if (this.editor) {
      this.editor.value = "";
      this.editor.attachments = [];
    }
  };

  private renderSuggestions() {
    if (!this.suggestion || this.filtered.length === 0) {
      return nothing;
    }
    return html`
      <ul class="zoea-composer__suggestions" role="listbox" aria-label="Slash commands">
        ${this.filtered.map((cmd, i) => html`
          <li
            class="zoea-composer__suggestion${i === this.selected ? " is-selected" : ""}"
            role="option"
            aria-selected=${i === this.selected}
            @mousedown=${(e: MouseEvent) => {
              // mousedown (not click) so the textarea blur doesn't
              // close the dropdown before we get a chance to accept.
              e.preventDefault();
              this.selected = i;
              this.acceptSuggestion(cmd);
            }}
          >
            <span class="zoea-composer__suggestion-name">/${cmd.name}</span>
            ${cmd.description
              ? html`<span class="zoea-composer__suggestion-desc">${cmd.description}</span>`
              : nothing}
          </li>
        `)}
      </ul>
    `;
  }

  override render() {
    return html`
      <div class="zoea-composer">
        <div class="zoea-composer__inner">
          ${this.renderSuggestions()}
          <message-editor
            .isStreaming=${this.isStreaming}
            .showAttachmentButton=${false}
            .showModelSelector=${false}
            .showThinkingSelector=${false}
            .onSend=${(input: string) => this.handleSend(input)}
            .onAbort=${() => this.onAbort?.()}
          ></message-editor>
        </div>
      </div>
    `;
  }
}
