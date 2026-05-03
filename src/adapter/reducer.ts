import type {
  ZoeaContentEventData,
  ZoeaMessageEventData,
  ZoeaRunEndData,
  ZoeaToolExecEndData,
  ZoeaToolExecStartData,
  ZoeaToolExecUpdateData,
  ZoeaTurnEndData,
} from "../api/zoea-types";
import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { A2uiFormMessage, ChatListMessage, ZoeaAction, ZoeaAgentState } from "./actions";
import {
  applyTextDelta,
  applyThinkingDelta,
  applyToolCallDelta,
  applyToolCallEnd,
  applyToolCallStart,
  assistantFromEventPayload,
  assistantFromUnknown,
  coerceAgentMessages,
  createOptimisticUserMessage,
  ensureStreamingAssistant,
  toolResultFromGateway,
  toolResultsFromUnknown,
} from "./message-builders";

function appendAssistant(messages: ZoeaAgentState["messages"], candidate: ZoeaAgentState["streamingMessage"]) {
  if (!candidate) {
    return messages;
  }
  const exists = messages.some((message) =>
    message.role === "assistant" &&
    message.timestamp === candidate.timestamp &&
    message.responseId === candidate.responseId,
  );
  return exists ? messages : [...messages, candidate];
}

// findFormMessage returns the index of the synthetic form-message
// entry for `surfaceId` in the message list, or -1 if not present.
function findFormMessageIdx(messages: ChatListMessage[], surfaceId: string): number {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "a2uiForm" && m.surfaceId === surfaceId) {
      return i;
    }
  }
  return -1;
}

// insertFormMessage places the synthetic form entry right after the
// assistant message whose responseId matches form.anchorAfterMessageId.
// Falls back to end-of-list when no matching anchor exists yet (the
// assistant message may stream in after the surface for very fast
// flows; the entry will reposition itself on later reducer passes if
// we ever add that, but in practice the assistant message lands
// first).
function insertFormMessage(messages: ChatListMessage[], form: A2uiFormMessage): ChatListMessage[] {
  if (findFormMessageIdx(messages, form.surfaceId) !== -1) {
    return messages;
  }
  if (!form.anchorAfterMessageId) {
    return [...messages, form];
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.responseId === form.anchorAfterMessageId) {
      return [...messages.slice(0, i + 1), form, ...messages.slice(i + 1)];
    }
  }
  return [...messages, form];
}

function updateFormMessage(messages: ChatListMessage[], surfaceId: string, patch: Partial<A2uiFormMessage>): ChatListMessage[] {
  const idx = findFormMessageIdx(messages, surfaceId);
  if (idx === -1) return messages;
  const current = messages[idx] as A2uiFormMessage;
  const next: A2uiFormMessage = { ...current, ...patch };
  return [...messages.slice(0, idx), next, ...messages.slice(idx + 1)];
}

function appendToolResults(messages: ZoeaAgentState["messages"], toolResults: ToolResultMessage[]) {
  let next = messages;
  for (const result of toolResults) {
    const exists = next.some((message) => message.role === "toolResult" && message.toolCallId === result.toolCallId);
    if (!exists) {
      next = [...next, result];
    }
  }
  return next;
}

function handleGatewayEvent(state: ZoeaAgentState, event: ZoeaAction & { type: "gateway.event" }): ZoeaAgentState {
  switch (event.event.type) {
    case "agent.run.start":
      return { ...state, isStreaming: true, lastError: undefined };

    case "agent.run.end": {
      const data = (event.event.data || {}) as ZoeaRunEndData;
      const fallbackMessages = Array.isArray(data.messages) ? coerceAgentMessages(data.messages) : [];
      return {
        ...state,
        isStreaming: false,
        streamingMessage: null,
        messages: fallbackMessages.length >= state.messages.length ? fallbackMessages : state.messages,
        pendingToolCalls: new Set<string>(),
        transientToolResults: new Map<string, ToolResultMessage>(),
      };
    }

    case "agent.message.start": {
      const data = (event.event.data || {}) as ZoeaMessageEventData;
      const assistant = assistantFromUnknown(data.message, state.model);
      if (!assistant) {
        return state;
      }
      return { ...state, isStreaming: true, streamingMessage: assistant };
    }

    case "agent.message.end": {
      const data = (event.event.data || {}) as ZoeaMessageEventData;
      const assistant = assistantFromUnknown(data.message, state.model);
      if (!assistant) {
        return state;
      }
      return {
        ...state,
        messages: appendAssistant(state.messages, assistant),
        streamingMessage: null,
      };
    }

    case "agent.text.start": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      return {
        ...state,
        isStreaming: true,
        streamingMessage: assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state),
      };
    }

    case "agent.text.delta": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      const base = assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state);
      const next = applyTextDelta(base, data.delta || "", data.content_index);
      return { ...state, isStreaming: true, streamingMessage: next };
    }

    case "agent.thinking.start": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      return {
        ...state,
        isStreaming: true,
        streamingMessage: assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state),
      };
    }

    case "agent.thinking.delta": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      const base = assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state);
      const next = applyThinkingDelta(base, data.delta || "", data.content_index);
      return { ...state, isStreaming: true, streamingMessage: next };
    }

    case "agent.toolcall.start": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      const base = assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state);
      const next = applyToolCallStart(base, data.tool_name, data.content_index);
      return { ...state, isStreaming: true, streamingMessage: next };
    }

    case "agent.toolcall.delta": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      const base = assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state);
      const next = applyToolCallDelta(base, data.delta || "", data.content_index);
      return { ...state, isStreaming: true, streamingMessage: next };
    }

    case "agent.toolcall.end": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      const base = assistantFromEventPayload(data, state.model) || ensureStreamingAssistant(state);
      const next = applyToolCallEnd(base, data.tool_call, data.content_index);
      return { ...state, isStreaming: true, streamingMessage: next };
    }

    case "agent.tool.start": {
      const data = (event.event.data || {}) as ZoeaToolExecStartData;
      const pendingToolCalls = new Set(state.pendingToolCalls);
      pendingToolCalls.add(data.tool_call_id);
      return { ...state, pendingToolCalls };
    }

    case "agent.tool.update": {
      const data = (event.event.data || {}) as ZoeaToolExecUpdateData;
      const transientToolResults = new Map(state.transientToolResults);
      transientToolResults.set(
        data.tool_call_id,
        toolResultFromGateway(data.tool_call_id, data.tool_name, data.partial_result, false),
      );
      return { ...state, transientToolResults };
    }

    case "agent.tool.end": {
      const data = (event.event.data || {}) as ZoeaToolExecEndData;
      const pendingToolCalls = new Set(state.pendingToolCalls);
      pendingToolCalls.delete(data.tool_call_id);
      const transientToolResults = new Map(state.transientToolResults);
      transientToolResults.set(
        data.tool_call_id,
        toolResultFromGateway(data.tool_call_id, data.tool_name, data.result, data.is_error),
      );
      return { ...state, pendingToolCalls, transientToolResults };
    }

    case "agent.turn.end": {
      const data = (event.event.data || {}) as ZoeaTurnEndData;
      const assistant = assistantFromUnknown(data.message, state.model) || state.streamingMessage;
      const toolResults = toolResultsFromUnknown(data.tool_results);
      const transientToolResults = new Map(state.transientToolResults);
      for (const result of toolResults) {
        transientToolResults.delete(result.toolCallId);
      }
      return {
        ...state,
        messages: appendToolResults(appendAssistant(state.messages, assistant), toolResults),
        streamingMessage: null,
        transientToolResults,
      };
    }

    case "agent.message.error": {
      const data = (event.event.data || {}) as ZoeaContentEventData;
      return { ...state, lastError: data.reason || "Agent message error" };
    }

    default:
      return state;
  }
}

export function reduceState(state: ZoeaAgentState, action: ZoeaAction): ZoeaAgentState {
  switch (action.type) {
    case "session.created": {
      const sessionChanged = state.sessionId && state.sessionId !== action.sessionId;
      return {
        ...state,
        sessionId: action.sessionId,
        userId: action.userId,
        projectId: action.projectId,
        a2uiSeq: sessionChanged ? undefined : state.a2uiSeq,
        a2uiSurfaceIds: sessionChanged ? [] : state.a2uiSurfaceIds,
        a2uiMessageIds: sessionChanged ? [] : state.a2uiMessageIds,
      };
    }

    case "session.cache.loaded":
      return {
        ...state,
        messages: action.messages,
        model: action.model || state.model,
        thinkingLevel: action.thinkingLevel || state.thinkingLevel,
      };

    case "session.hydrated":
      return {
        ...state,
        messages: action.messages,
        model: action.model || state.model,
        thinkingLevel: action.thinkingLevel || state.thinkingLevel,
      };

    case "state.loaded":
      return {
        ...state,
        model: action.model || state.model,
        thinkingLevel: action.thinkingLevel || state.thinkingLevel,
        isStreaming: action.isStreaming,
      };

    case "ws.connecting":
      return {
        ...state,
        connection:
          state.connection === "open" || state.connection === "reconnecting" ? "reconnecting" : "connecting",
      };

    case "ws.connected":
      return { ...state, connection: "open", lastError: undefined };

    case "ws.closed":
      return { ...state, connection: action.reconnecting ? "reconnecting" : "closed" };

    case "prompt.optimistic":
      return {
        ...state,
        messages: [...state.messages, createOptimisticUserMessage(action.text, action.timestamp)],
        lastError: undefined,
      };

    case "gateway.event":
      return handleGatewayEvent(state, action);

    case "a2ui.snapshot.received":
      return {
        ...state,
        a2uiSeq: action.seq,
        a2uiSurfaceIds: action.surfaceIds,
        a2uiMessageIds: action.messageIds,
      };

    case "a2ui.batch.received":
      return {
        ...state,
        a2uiSeq: action.seq ?? state.a2uiSeq,
        a2uiSurfaceIds: action.surfaceIds,
        a2uiMessageIds: action.messageIds,
      };

    case "a2ui.updated":
      return {
        ...state,
        a2uiSurfaceIds: action.surfaceIds,
        a2uiMessageIds: action.messageIds,
      };

    case "a2ui.surface.created": {
      const form: A2uiFormMessage = {
        role: "a2uiForm",
        surfaceId: action.surfaceId,
        messageId: action.messageId,
        anchorAfterMessageId: action.messageId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      return { ...state, messages: insertFormMessage(state.messages, form) };
    }

    case "a2ui.surface.deleted": {
      const idx = findFormMessageIdx(state.messages, action.surfaceId);
      if (idx === -1) return state;
      // Don't strip the form bubble on surface deletion — A2UI emits
      // deleteSurface to free state, but we want the post-submit card
      // to remain in the timeline as historical record. Only remove
      // forms that are still pending (i.e. server canceled mid-flight
      // without a recorded submission).
      const current = state.messages[idx] as A2uiFormMessage;
      if (current.status !== "pending") return state;
      const next = [...state.messages.slice(0, idx), ...state.messages.slice(idx + 1)];
      return { ...state, messages: next };
    }

    case "a2ui.surface.submitted":
      return {
        ...state,
        messages: updateFormMessage(state.messages, action.surfaceId, {
          status: action.status,
          submittedAction: action.action,
          submittedValues: action.values,
          submittedAt: action.at,
          messageId: action.messageId || undefined as unknown as string,
        }),
      };

    case "a2ui.surfaces.rehydrate": {
      // Replace any existing a2uiForm entries with the rehydrated set
      // so a snapshot-driven reload converges to one canonical view.
      const withoutForms = state.messages.filter((m) => m.role !== "a2uiForm");
      let next: ChatListMessage[] = withoutForms;
      for (const entry of action.entries) {
        next = insertFormMessage(next, entry);
      }
      return { ...state, messages: next };
    }

    case "error":
      return { ...state, connection: "error", lastError: action.message };

    default:
      return state;
  }
}
