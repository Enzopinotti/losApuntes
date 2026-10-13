import type { ResourceView } from "@losapuntes/contracts";

import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "@/features/resources/resource-consumption-controller";
import type { ResourceConsumptionApi } from "@/features/resources/resource-consumption-api";

export const HOME_SAVED_PREVIEW_LIMIT = 3;

export type HomeSavedReturnSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      items: ResourceView[];
      moreAvailable: boolean;
    }
  | {
      kind: "failure";
      authorityKey: string;
      reason: ResourceConsumptionFailure;
    };

type Listener = (snapshot: HomeSavedReturnSnapshot) => void;

/**
 * A short, server-authorized entry to the saved library, not a reading-history
 * tracker. It never persists content, signed URLs or the previous account's
 * projection, and each return to Home obtains a fresh authorization decision.
 */
export class HomeSavedReturnController {
  private snapshot: HomeSavedReturnSnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private generation = 0;
  private active: AbortController | null = null;

  constructor(private readonly api: Pick<ResourceConsumptionApi, "saved">) {}

  getSnapshot(): HomeSavedReturnSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string): Promise<void> {
    this.active?.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.active = controller;
    this.publish({ kind: "loading", authorityKey });

    try {
      // The existing endpoint returns a bounded page in descending save order
      // and removes resources the viewer may no longer read.
      const page = await this.api.saved(undefined, controller.signal);
      if (!this.isCurrent(generation, controller, authorityKey)) return;

      const unique = new Map<string, ResourceView>();
      for (const item of page.items) {
        if (!unique.has(item.id)) unique.set(item.id, item);
      }
      const items = [...unique.values()];
      this.publish({
        kind: "ready",
        authorityKey,
        items: items.slice(0, HOME_SAVED_PREVIEW_LIMIT),
        moreAvailable:
          page.nextCursor !== null || items.length > HOME_SAVED_PREVIEW_LIMIT,
      });
    } catch (error) {
      if (!this.isCurrent(generation, controller, authorityKey)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        reason: resourceConsumptionFailure(error),
      });
    } finally {
      if (this.active === controller) this.active = null;
    }
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey !== authorityKey
    ) {
      return;
    }
    this.generation += 1;
    this.active?.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  private isCurrent(
    generation: number,
    controller: AbortController,
    authorityKey: string,
  ): boolean {
    return (
      generation === this.generation &&
      controller === this.active &&
      !controller.signal.aborted &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey === authorityKey
    );
  }

  private publish(snapshot: HomeSavedReturnSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
