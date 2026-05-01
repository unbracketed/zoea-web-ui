import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { ZoeaAgentState } from "./actions";

export function selectVisibleMessages(state: ZoeaAgentState) {
  return state.messages;
}

export function selectToolResultsById(state: ZoeaAgentState): Map<string, ToolResultMessage> {
  const result = new Map<string, ToolResultMessage>();

  for (const message of state.messages) {
    if (message.role === "toolResult") {
      result.set(message.toolCallId, message);
    }
  }

  for (const [toolCallId, message] of state.transientToolResults.entries()) {
    result.set(toolCallId, message);
  }

  return result;
}

export function selectCanSend(state: ZoeaAgentState): boolean {
  return !state.isStreaming && state.connection !== "connecting" && state.connection !== "reconnecting";
}

export function selectConnectionLabel(state: ZoeaAgentState): string {
  switch (state.connection) {
    case "open":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "closed":
      return "Closed";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}
