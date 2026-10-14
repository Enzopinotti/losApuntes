import { ApiRequestError } from "@/services/api/client";

import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "../resources/resource-consumption-controller";

export type QuickSaveState = "saving" | "saved" | "uncertain" | "error";

export type SearchQuickSaveEntry = {
  state: QuickSaveState;
  failure: ResourceConsumptionFailure | null;
};

export type SearchQuickSaveSnapshot = {
  authorityKey: string | null;
  items: Record<string, SearchQuickSaveEntry>;
};

export interface SearchQuickSaveApi {
  save(resourceId: string, signal?: AbortSignal): Promise<{ saved: true }>;
}

type Listener = (snapshot: SearchQuickSaveSnapshot) => void;
type Operation = {
  authorityKey: string;
  resourceId: string;
  generation: number;
  controller: AbortController;
};

/**
 * Confirmation of a save is server-authoritative. In particular a timeout,
 * offline disconnect, or abort after the PUT might mean that it was committed;
 * we do not silently issue a second PUT or report success in those cases.
 */
export class MobileSearchQuickSaveController {
  private snapshot: SearchQuickSaveSnapshot = {
    authorityKey: null,
    items: {},
  };
  private readonly listeners = new Set<Listener>();
  private readonly operations = new Map<string, Operation>();
  private generation = 0;

  constructor(private readonly api: SearchQuickSaveApi) {}

  getSnapshot(): SearchQuickSaveSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setAuthority(authorityKey: string | null): void {
    if (this.snapshot.authorityKey === authorityKey) return;
    this.cancelAll();
    this.publish({ authorityKey, items: {} });
  }

  async save(authorityKey: string, resourceId: string): Promise<boolean> {
    if (!resourceId || this.snapshot.authorityKey !== authorityKey)
      return false;
    const existing = this.snapshot.items[resourceId];
    if (
      existing?.state === "saving" ||
      existing?.state === "saved" ||
      existing?.state === "uncertain" ||
      this.operations.has(resourceId)
    )
      return false;

    const operation: Operation = {
      authorityKey,
      resourceId,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.operations.set(resourceId, operation);
    this.update(resourceId, { state: "saving", failure: null });

    try {
      const response = await this.api.save(
        resourceId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return false;
      if (response.saved !== true) {
        this.update(resourceId, { state: "uncertain", failure: "error" });
        return false;
      }
      this.update(resourceId, { state: "saved", failure: null });
      return true;
    } catch (error) {
      if (!this.isCurrent(operation)) return false;
      const failure = resourceConsumptionFailure(error);
      const definite =
        error instanceof ApiRequestError &&
        (error.kind === "forbidden" ||
          error.kind === "unauthorized" ||
          error.kind === "validation" ||
          error.kind === "conflict" ||
          error.kind === "gone" ||
          error.status === 404);
      this.update(resourceId, {
        state: definite ? "error" : "uncertain",
        failure,
      });
      return false;
    } finally {
      if (this.operations.get(resourceId) === operation) {
        this.operations.delete(resourceId);
      }
    }
  }

  invalidate(): void {
    this.cancelAll();
    this.publish({ authorityKey: null, items: {} });
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.snapshot.authorityKey === operation.authorityKey &&
      this.generation === operation.generation &&
      this.operations.get(operation.resourceId) === operation &&
      !operation.controller.signal.aborted
    );
  }

  private update(resourceId: string, item: SearchQuickSaveEntry): void {
    this.publish({
      ...this.snapshot,
      items: { ...this.snapshot.items, [resourceId]: item },
    });
  }

  private cancelAll(): void {
    this.generation += 1;
    for (const operation of this.operations.values()) {
      operation.controller.abort();
    }
    this.operations.clear();
  }

  private publish(snapshot: SearchQuickSaveSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
