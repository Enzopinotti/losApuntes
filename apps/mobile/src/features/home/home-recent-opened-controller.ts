import { ApiRequestError } from "@/services/api/client";
import type { ResourceView } from "@losapuntes/contracts";

import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "@/features/resources/resource-consumption-controller";
import type { ResourceConsumptionApi } from "@/features/resources/resource-consumption-api";
import {
  RECENT_OPENED_PREVIEW_LIMIT,
  SessionRecentResourceOpens,
} from "@/features/resources/recent-opened-memory";
import { prioritizeHomeRecentlyOpened } from "./home-recent-academic-continuity";

export type HomeRecentOpenedSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      items: ResourceView[];
      moreAvailable: boolean;
      partialFailure: ResourceConsumptionFailure | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      reason: ResourceConsumptionFailure;
    };

type Listener = (snapshot: HomeRecentOpenedSnapshot) => void;

type VerifiedRecent =
  | { kind: "readable"; resource: ResourceView }
  | { kind: "revoked"; resourceId: string }
  | { kind: "failure"; reason: ResourceConsumptionFailure };

/**
 * Re-authorizes every candidate ID before rendering it in Home.
 * A saved relation is not required: recently opened and recently saved are
 * distinct user journeys. No projection is shared with the memory registry.
 */
export class HomeRecentOpenedController {
  private snapshot: HomeRecentOpenedSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: AbortController | null = null;

  constructor(
    private readonly api: Pick<ResourceConsumptionApi, "resource">,
    private readonly memory: SessionRecentResourceOpens,
  ) {}

  getSnapshot(): HomeRecentOpenedSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string, sessionAuthorityKey = authorityKey, preferredSubjectId: string | null = null): Promise<void> {
    this.active?.abort();
    const generation = ++this.generation;
    const operation = new AbortController();
    this.active = operation;
    this.publish({ kind: "loading", authorityKey });
    const ids = this.memory.read(sessionAuthorityKey);

    if (ids.length === 0) {
      if (this.isCurrent(generation, operation, authorityKey)) {
        this.publish({
          kind: "ready",
          authorityKey,
          items: [],
          moreAvailable: false,
          partialFailure: null,
        });
      }
      if (this.active === operation) this.active = null;
      return;
    }

    try {
      const checks = await Promise.all(ids.map(async (resourceId): Promise<VerifiedRecent> => {
        try {
          const result = await this.api.resource(resourceId, operation.signal);
          // Defense in depth: never show a resource that does not match its ID.
          if (result.resource.id !== resourceId) {
            return { kind: "failure", reason: "error" };
          }
          return { kind: "readable", resource: result.resource };
        } catch (error) {
          // A revoked/deleted resource is removed from session memory only
          // after the entire request is fenced to this same authority.
          if (
            error instanceof ApiRequestError &&
            (error.status === 404 ||
              (error.status === 403 && error.code !== "ACCOUNT_RESTRICTED"))
          ) {
            return { kind: "revoked", resourceId };
          }
          return { kind: "failure", reason: resourceConsumptionFailure(error) };
        }
      }));
      if (!this.isCurrent(generation, operation, authorityKey)) return;

      const items: ResourceView[] = [];
      let partialFailure: ResourceConsumptionFailure | null = null;
      for (const result of checks) {
        if (result.kind === "readable") {
          items.push(result.resource);
        } else if (result.kind === "revoked") {
          this.memory.forget(sessionAuthorityKey, result.resourceId);
        } else {
          partialFailure ??= result.reason;
        }
      }
      if (items.length === 0 && partialFailure) {
        this.publish({ kind: "failure", authorityKey, reason: partialFailure });
      } else {
        this.publish({
          kind: "ready",
          authorityKey,
          items: prioritizeHomeRecentlyOpened(items, preferredSubjectId, RECENT_OPENED_PREVIEW_LIMIT),
          moreAvailable: items.length > RECENT_OPENED_PREVIEW_LIMIT,
          partialFailure,
        });
      }
    } catch (error) {
      if (this.isCurrent(generation, operation, authorityKey)) {
        this.publish({
          kind: "failure",
          authorityKey,
          reason: resourceConsumptionFailure(error),
        });
      }
    } finally {
      if (this.active === operation) this.active = null;
    }
  }

  clear(authorityKey: string, sessionAuthorityKey = authorityKey): void {
    if (this.snapshot.kind === "idle" || this.snapshot.authorityKey !== authorityKey) return;
    this.memory.clear(sessionAuthorityKey);
    ++this.generation;
    this.active?.abort();
    this.active = null;
    this.publish({
      kind: "ready",
      authorityKey,
      items: [],
      moreAvailable: false,
      partialFailure: null,
    });
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey !== authorityKey
    ) return;
    ++this.generation;
    this.active?.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  private isCurrent(generation: number, operation: AbortController, authorityKey: string): boolean {
    return generation === this.generation &&
      operation === this.active &&
      !operation.signal.aborted &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey === authorityKey;
  }

  private publish(snapshot: HomeRecentOpenedSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
