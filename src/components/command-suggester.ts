import type { ZoeaCommandInfo } from "../api/zoea-types";

// SuggestionState describes the slash-command query inferred from the
// composer's current text + caret position. `null` means autocomplete
// should not show. `query` is the partial command name typed so far
// (without the leading slash); it can be empty when the user has just
// typed "/" and we want to surface the full list.
export interface SuggestionState {
  query: string;
  // The character index where the slash is. Insertion uses this to
  // replace the slash-prefix span with the chosen command name.
  start: number;
  // One-past-the-last character of the in-progress token (caret pos
  // when the user is actively typing).
  end: number;
}

// detectSlashCommand decides whether the user is currently typing a
// slash command. It returns null in any of:
//   - text is empty
//   - text doesn't start with "/"
//   - the slash-prefix token has been "committed" by typing whitespace
//   - the caret has moved before the slash
// The "starts with /" rule mirrors the Pi terminal — slash commands are
// only recognized at the very start of the buffer, never embedded.
export function detectSlashCommand(text: string, caret: number): SuggestionState | null {
  if (!text.startsWith("/")) {
    return null;
  }
  // Scan from "/" forward; whitespace ends the prefix token. If the
  // caret has moved past whitespace, autocomplete is no longer relevant.
  let end = 1;
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }
  if (caret < 1 || caret > end) {
    return null;
  }
  return { query: text.slice(1, end), start: 0, end };
}

// rankCommands filters and orders commands for the suggestion list.
// Ranking rules:
//   1. Prefix matches (case-insensitive) come before substring matches.
//   2. Within each band, ties broken by name length then alphabetical.
//   3. Empty query returns everything in alphabetical order so the user
//      can browse what's available right after typing "/".
export function rankCommands(commands: ZoeaCommandInfo[], query: string, limit = 8): ZoeaCommandInfo[] {
  const q = query.toLowerCase();
  if (q === "") {
    return [...commands]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  type Scored = { cmd: ZoeaCommandInfo; band: 0 | 1 };
  const scored: Scored[] = [];
  for (const cmd of commands) {
    const name = cmd.name.toLowerCase();
    if (name.startsWith(q)) {
      scored.push({ cmd, band: 0 });
    } else if (name.includes(q)) {
      scored.push({ cmd, band: 1 });
    }
  }
  scored.sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    if (a.cmd.name.length !== b.cmd.name.length) return a.cmd.name.length - b.cmd.name.length;
    return a.cmd.name.localeCompare(b.cmd.name);
  });
  return scored.slice(0, limit).map((s) => s.cmd);
}

// applyCommand returns the new buffer + caret position after accepting
// a suggestion. Always inserts a trailing space so the user can start
// typing arguments immediately.
export function applyCommand(text: string, suggestion: SuggestionState, command: ZoeaCommandInfo): { text: string; caret: number } {
  const replacement = `/${command.name} `;
  const next = replacement + text.slice(suggestion.end);
  return { text: next, caret: replacement.length };
}
