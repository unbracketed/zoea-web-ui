import { MessageProcessor, type SurfaceModel, type A2uiClientAction } from "@a2ui/web_core/v0_9";
import { basicCatalog, type LitComponentApi } from "@a2ui/lit/v0_9";

export type A2uiActionListener = (action: A2uiClientAction) => void | Promise<void>;

// Lifecycle events the adapter wires into the reducer so synthetic
// a2uiForm chat messages stay in sync with the controller's surface
// state. These are *not* emitted to the network — they are local
// signals describing observable changes in the controller.
export interface A2uiLifecycleListener {
  onSurfaceCreated?(surfaceId: string, messageId: string): void;
  onSurfaceDeleted?(surfaceId: string): void;
}

export interface A2uiSurfaceEntry {
  id: string;
  surface: SurfaceModel<LitComponentApi>;
}

export interface A2uiSubmissionRecord {
  surfaceId: string;
  messageId: string;
  actionName?: string;
  status: "submitted" | "cancelled";
  values?: Record<string, unknown>;
  at?: string;
}

export class A2uiSessionController {
  private processor: MessageProcessor<LitComponentApi>;
  private surfaceOrder: string[] = [];
  // Maps each known surfaceId to the assistant message it belongs to.
  // Surfaces created in a batch with no message_id are recorded with an
  // empty string and rendered in the legacy side panel as "orphans".
  private surfaceOwner = new Map<string, string>();
  // Per-message order of surfaces, so render order in a chat bubble
  // matches creation order even when a single message produced
  // multiple surfaces.
  private surfacesByMessage = new Map<string, string[]>();
  // Recorded submissions keyed by surfaceId. Mirrors the broker's
  // per-surface record so reload re-applies the closed-state card.
  private submissions = new Map<string, A2uiSubmissionRecord>();
  private currentMessageID = "";
  private readonly listeners = new Set<() => void>();
  private surfaceCreatedSubscription?: { unsubscribe: () => void };
  private surfaceDeletedSubscription?: { unsubscribe: () => void };
  private latestSeq?: number;

  constructor(
    private readonly actionHandler?: A2uiActionListener,
    private readonly lifecycle?: A2uiLifecycleListener,
  ) {
    this.processor = this.buildProcessor();
  }

  reset(): void {
    this.disposeProcessorSubscriptions();
    this.surfaceOrder = [];
    this.surfaceOwner = new Map();
    this.surfacesByMessage = new Map();
    this.submissions = new Map();
    this.currentMessageID = "";
    this.latestSeq = undefined;
    this.processor = this.buildProcessor();
    this.notify();
  }

  // Records a server-confirmed submission. Called by the adapter on
  // agent.a2ui.submission (live) or once per entry on snapshot replay.
  applySubmission(record: A2uiSubmissionRecord): void {
    this.submissions.set(record.surfaceId, record);
    this.notify();
  }

  getSubmission(surfaceId: string): A2uiSubmissionRecord | undefined {
    return this.submissions.get(surfaceId);
  }

  getAllSubmissions(): A2uiSubmissionRecord[] {
    return [...this.submissions.values()];
  }

  applySnapshot(seq: number | undefined, messages: unknown[], groups?: ReadonlyArray<{ message_id?: string; messages?: unknown[] }>): void {
    this.reset();
    this.latestSeq = seq;
    if (groups && groups.length > 0) {
      // Replay each group with its message_id so surfaces re-attach to
      // the correct chat bubble.
      for (const g of groups) {
        const gm = Array.isArray(g.messages) ? g.messages : [];
        if (gm.length === 0) {
          continue;
        }
        this.currentMessageID = g.message_id || "";
        this.processMessages(gm);
      }
      this.currentMessageID = "";
    } else {
      // Legacy snapshot without grouping — all surfaces become orphans.
      this.processMessages(messages);
    }
    this.notify();
  }

  applyBatch(seq: number | undefined, messages: unknown[], messageID?: string): void {
    if (typeof seq === "number") {
      this.latestSeq = seq;
    }
    this.currentMessageID = messageID || "";
    try {
      this.processMessages(messages);
    } finally {
      this.currentMessageID = "";
    }
    this.notify();
  }

  getSurfaces(): A2uiSurfaceEntry[] {
    const map = this.processor.model.surfacesMap;
    const result: A2uiSurfaceEntry[] = [];
    for (const id of this.surfaceOrder) {
      const surface = map.get(id);
      if (surface) {
        result.push({ id, surface });
      }
    }
    return result;
  }

  // Surfaces tied to a specific assistant message. Used by the chat
  // renderer to draw A2UI inline inside that message's bubble.
  getSurfacesForMessage(messageID: string): A2uiSurfaceEntry[] {
    if (!messageID) {
      return [];
    }
    const ids = this.surfacesByMessage.get(messageID);
    if (!ids || ids.length === 0) {
      return [];
    }
    const map = this.processor.model.surfacesMap;
    const result: A2uiSurfaceEntry[] = [];
    for (const id of ids) {
      const surface = map.get(id);
      if (surface) {
        result.push({ id, surface });
      }
    }
    return result;
  }

  // Surfaces that arrived without a message_id correlation — shown in
  // the legacy side panel so we don't drop them on the floor.
  getOrphanSurfaces(): A2uiSurfaceEntry[] {
    const map = this.processor.model.surfacesMap;
    const result: A2uiSurfaceEntry[] = [];
    for (const id of this.surfaceOrder) {
      const owner = this.surfaceOwner.get(id);
      if (owner) {
        continue;
      }
      const surface = map.get(id);
      if (surface) {
        result.push({ id, surface });
      }
    }
    return result;
  }

  getSurfaceIds(): string[] {
    return [...this.surfaceOrder];
  }

  // Message ids that currently own at least one A2UI surface.
  getMessageIdsWithSurfaces(): string[] {
    return [...this.surfacesByMessage.keys()];
  }

  getSeq(): number | undefined {
    return this.latestSeq;
  }

  getClientDataModel(): unknown {
    return this.processor.getClientDataModel();
  }

  getClientCapabilities(): unknown {
    return this.processor.getClientCapabilities();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposeProcessorSubscriptions();
    this.listeners.clear();
    this.processor.model.dispose();
  }

  private buildProcessor(): MessageProcessor<LitComponentApi> {
    const processor = new MessageProcessor<LitComponentApi>([basicCatalog], (action) => {
      if (this.actionHandler) {
        return this.actionHandler(action);
      }
    });
    this.surfaceCreatedSubscription = processor.onSurfaceCreated((surface) => {
      if (!this.surfaceOrder.includes(surface.id)) {
        this.surfaceOrder = [...this.surfaceOrder, surface.id];
      }
      const owner = this.currentMessageID;
      this.surfaceOwner.set(surface.id, owner);
      if (owner) {
        const existing = this.surfacesByMessage.get(owner) || [];
        if (!existing.includes(surface.id)) {
          this.surfacesByMessage.set(owner, [...existing, surface.id]);
        }
      }
      this.lifecycle?.onSurfaceCreated?.(surface.id, owner);
      this.notify();
    });
    this.surfaceDeletedSubscription = processor.onSurfaceDeleted((id) => {
      this.surfaceOrder = this.surfaceOrder.filter((existing) => existing !== id);
      const owner = this.surfaceOwner.get(id);
      this.surfaceOwner.delete(id);
      if (owner) {
        const existing = this.surfacesByMessage.get(owner);
        if (existing) {
          const next = existing.filter((existingId) => existingId !== id);
          if (next.length === 0) {
            this.surfacesByMessage.delete(owner);
          } else {
            this.surfacesByMessage.set(owner, next);
          }
        }
      }
      this.lifecycle?.onSurfaceDeleted?.(id);
      this.notify();
    });
    return processor;
  }

  private processMessages(messages: unknown[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }
    try {
      this.processor.processMessages(messages as Parameters<MessageProcessor<LitComponentApi>["processMessages"]>[0]);
    } catch (error) {
      console.error("A2UI processMessages failed", error);
    }
  }

  private disposeProcessorSubscriptions(): void {
    this.surfaceCreatedSubscription?.unsubscribe();
    this.surfaceDeletedSubscription?.unsubscribe();
    this.surfaceCreatedSubscription = undefined;
    this.surfaceDeletedSubscription = undefined;
    this.processor?.model.dispose();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
