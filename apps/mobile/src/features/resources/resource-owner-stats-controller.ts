import type { OwnedResourceStatistics } from "@losapuntes/contracts";

import type { OwnerStatisticsApi } from "./resource-owner-stats-api";
import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";

export type OwnerStatisticsSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      data: OwnedResourceStatistics;
    }
  | {
      kind: "failure";
      authorityKey: string;
      failure: ResourceConsumptionFailure;
    };

type Listener = (value: OwnerStatisticsSnapshot) => void;

type ActiveOperation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
};

/**
 * The only cache is a focused screen snapshot. No data from a former
 * account/session survives a scope switch or app suspension.
 */
export class MobileOwnerStatisticsController {
  private snapshot: OwnerStatisticsSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: ActiveOperation | null = null;

  constructor(private readonly api: OwnerStatisticsApi) {}

  getSnapshot(): OwnerStatisticsSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string): Promise<void> {
    this.abort();
    const operation = {
      authorityKey,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({ kind: "loading", authorityKey });

    try {
      const data = await this.api.getStatistics(operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      this.publish({ kind: "ready", authorityKey, data });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        failure: resourceConsumptionFailure(error),
      });
    } finally {
      if (this.active === operation) this.active = null;
    }
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey !== authorityKey
    )
      return;
    this.abort();
    this.publish({ kind: "idle" });
  }

  suspend(authorityKey: string): void {
    this.invalidate(authorityKey);
  }

  private abort(): void {
    ++this.generation;
    this.active?.controller.abort();
    this.active = null;
  }

  private isCurrent(operation: ActiveOperation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted &&
      this.snapshot.kind === "loading" &&
      this.snapshot.authorityKey === operation.authorityKey
    );
  }

  private publish(snapshot: OwnerStatisticsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
