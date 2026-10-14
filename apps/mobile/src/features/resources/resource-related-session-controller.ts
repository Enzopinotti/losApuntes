import { ApiRequestError } from "@/services/api/client";
import type { ResourceView } from "@losapuntes/contracts";

import type { ResourceConsumptionApi } from "./resource-consumption-api";
import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import {
  SessionRecentResourceOpens,
  RECENT_OPENED_MEMORY_LIMIT,
} from "./recent-opened-memory";

export const RELATED_SESSION_STUDY_PREVIEW_LIMIT = 3;

export type ResourceRelatedSessionSnapshot =
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

type Listener = (snapshot: ResourceRelatedSessionSnapshot) => void;

type Check =
  | { kind: "verified"; resource: ResourceView }
  | { kind: "removed"; id: string }
  | { kind: "failure"; reason: ResourceConsumptionFailure };

/**
 * Related means "previously opened in this JS session, same canonical
 * Subject", NOT recommendation, similarity, or a global search result.
 * Every ID is reauthorized using the existing resource detail API.
 */
export class ResourceRelatedSessionController {
  private snapshot: ResourceRelatedSessionSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: AbortController | null = null;

  constructor(
    private readonly api: Pick<ResourceConsumptionApi, "resource">,
    private readonly memory: SessionRecentResourceOpens,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ResourceRelatedSessionSnapshot {
    return this.snapshot;
  }

  async load(
    authorityKey: string,
    sessionAuthorityKey: string,
    currentResourceId: string,
    subjectId: string,
  ): Promise<void> {
    this.active?.abort();
    const generation = ++this.generation;
    const operation = new AbortController();
    this.active = operation;
    this.publish({ kind: "loading", authorityKey });

    const candidates = this.memory
      .read(sessionAuthorityKey)
      .filter((id) => id !== currentResourceId)
      .slice(0, RECENT_OPENED_MEMORY_LIMIT - 1);

    if (candidates.length === 0) {
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
      const checks = await Promise.all(
        candidates.map(async (id): Promise<Check> => {
          try {
            const response = await this.api.resource(id, operation.signal);
            if (response.resource.id !== id) {
              return { kind: "failure", reason: "error" };
            }
            return { kind: "verified", resource: response.resource };
          } catch (error) {
            if (
              error instanceof ApiRequestError &&
              (error.status === 404 ||
                (error.status === 403 && error.code !== "ACCOUNT_RESTRICTED"))
            ) {
              return { kind: "removed", id };
            }
            return {
              kind: "failure",
              reason: resourceConsumptionFailure(error),
            };
          }
        }),
      );
      if (!this.isCurrent(generation, operation, authorityKey)) return;

      const matches: ResourceView[] = [];
      let partialFailure: ResourceConsumptionFailure | null = null;
      for (const result of checks) {
        if (result.kind === "removed") {
          this.memory.forget(sessionAuthorityKey, result.id);
        } else if (result.kind === "failure") {
          partialFailure ??= result.reason;
        } else if (result.resource.academic.subject.id === subjectId) {
          // Never show metadata returned for an unrelated Subject.
          matches.push(result.resource);
        }
      }

      if (matches.length === 0 && partialFailure) {
        this.publish({ kind: "failure", authorityKey, reason: partialFailure });
      } else {
        this.publish({
          kind: "ready",
          authorityKey,
          items: matches.slice(0, RELATED_SESSION_STUDY_PREVIEW_LIMIT),
          moreAvailable: matches.length > RELATED_SESSION_STUDY_PREVIEW_LIMIT,
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

  private publish(snapshot: ResourceRelatedSessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
