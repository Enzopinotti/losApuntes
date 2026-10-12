import type {
  OwnedResourcesPage,
  ResourceView,
  ResourceVisibility,
} from "@losapuntes/contracts";

import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import type { OwnedResourcesApi } from "./resource-owned-api";

export type OwnedResourcesSnapshot =
  | { kind: "idle" }
  | {
      kind: "loading";
      authorityKey: string;
      visibility: ResourceVisibility | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      visibility: ResourceVisibility | null;
      failure: ResourceConsumptionFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      visibility: ResourceVisibility | null;
      data: OwnedResourcesPage;
      loadingMore: boolean;
      failure: ResourceConsumptionFailure | null;
    };

type Listener = (snapshot: OwnedResourcesSnapshot) => void;
type Operation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
  visibility: ResourceVisibility | null;
};

function appendUnique(
  original: ResourceView[],
  incoming: ResourceView[],
): ResourceView[] {
  const seen = new Set(original.map((resource) => resource.id));
  const result = [...original];
  for (const resource of incoming) {
    if (!seen.has(resource.id)) {
      seen.add(resource.id);
      result.push(resource);
    }
  }
  return result;
}

/**
 * All pages are scoped to one session and server-side visibility filter.
 * Late responses cannot reveal the preceding account's publications.
 */
export class MobileOwnedResourcesController {
  private snapshot: OwnedResourcesSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: Operation | null = null;

  constructor(private readonly api: OwnedResourcesApi) {}

  getSnapshot(): OwnedResourcesSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(
    authorityKey: string,
    visibility: ResourceVisibility | null = null,
  ): Promise<void> {
    const operation = this.begin(authorityKey, visibility);
    this.publish({ kind: "loading", authorityKey, visibility });

    try {
      const data = await this.api.listOwned(
        visibility ? { visibility } : {},
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        visibility,
        data,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.publish({
          kind: "failure",
          authorityKey,
          visibility,
          failure: resourceConsumptionFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    if (!current || !current.data.nextCursor || current.loadingMore || this.active) {
      return;
    }

    const operation = this.begin(authorityKey, current.visibility);
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const next = await this.api.listOwned(
        {
          ...(current.visibility ? { visibility: current.visibility } : {}),
          cursor: current.data.nextCursor,
        },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest || latest.visibility !== operation.visibility) return;
      this.publish({
        ...latest,
        data: {
          items: appendUnique(latest.data.items, next.items),
          nextCursor: next.nextCursor,
        },
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: resourceConsumptionFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  suspend(authorityKey: string): void {
    if (
      this.snapshot.kind === "idle" ||
      this.snapshot.authorityKey !== authorityKey
    ) return;
    this.cancel();
    this.publish({ kind: "idle" });
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey !== authorityKey
    ) return;
    this.cancel();
    this.publish({ kind: "idle" });
  }

  private begin(
    authorityKey: string,
    visibility: ResourceVisibility | null,
  ): Operation {
    this.cancel();
    const operation: Operation = {
      authorityKey,
      visibility,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    return operation;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey === operation.authorityKey &&
      this.snapshot.visibility === operation.visibility
    );
  }

  private ready(
    authorityKey: string,
  ): Extract<OwnedResourcesSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private finish(operation: Operation): void {
    if (this.active === operation) this.active = null;
  }

  private cancel(): void {
    ++this.generation;
    this.active?.controller.abort();
    this.active = null;
  }

  private publish(snapshot: OwnedResourcesSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
