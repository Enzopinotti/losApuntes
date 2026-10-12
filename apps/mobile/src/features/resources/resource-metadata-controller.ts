import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { ResourceConsumptionApi } from "./resource-consumption-api";
import {
  resourceMetadataMatches,
  validateResourceMetadata,
  type ResourceMetadataDraft,
  type ResourceMetadataUpdateInput,
} from "./resource-metadata-policy";
import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";

export type MobileResourceMetadataSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      resource: ResourceView;
      busy: "updating" | "refreshing" | null;
      outcome: "none" | "saved" | "conflict" | "uncertain";
      failure: ResourceConsumptionFailure | null;
    };

type Ready = Extract<MobileResourceMetadataSnapshot, { kind: "ready" }>;
type Listener = (snapshot: MobileResourceMetadataSnapshot) => void;
type Operation = {
  authorityKey: string;
  resourceId: string;
  generation: number;
  controller: AbortController;
};

/**
 * PATCH is optimistic-concurrency protected by expectedRevision.
 * An ambiguous network failure is never retried blindly: GET authoritative
 * state first and require the student to review before another edit.
 */
export class MobileResourceMetadataController {
  private snapshot: MobileResourceMetadataSnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private active: Operation | null = null;
  private generation = 0;
  private lastAttempt: {
    authorityKey: string;
    baseline: ResourceView;
    input: ResourceMetadataUpdateInput;
  } | null = null;

  constructor(private readonly api: Pick<ResourceConsumptionApi, "update" | "resource">) {}

  getSnapshot(): MobileResourceMetadataSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScope(authorityKey: string, resource: ResourceView): void {
    const current = this.current(authorityKey, resource.id);
    if (current) {
      // A delayed detail GET must not roll back a successful PATCH response.
      if (
        current.busy === null &&
        current.outcome !== "uncertain" &&
        resource.revision > current.resource.revision
      ) {
        this.publish({
          ...current,
          resource,
          outcome: "conflict",
          failure: null,
        });
      }
      return;
    }

    this.abort();
    this.lastAttempt = null;
    this.publish({
      kind: "ready",
      authorityKey,
      resource,
      busy: null,
      outcome: "none",
      failure: null,
    });
  }

  clearOutcome(authorityKey: string, resourceId: string): void {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy || current.outcome === "uncertain") return;
    this.lastAttempt = null;
    this.publish({ ...current, outcome: "none", failure: null });
  }

  async submit(
    authorityKey: string,
    resourceId: string,
    draft: ResourceMetadataDraft,
  ): Promise<boolean> {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy || current.outcome === "uncertain") return false;
    const validation = validateResourceMetadata(current.resource, draft);
    if (validation.kind !== "valid") return false;

    const baseline = current.resource;
    const input = validation.input;
    this.lastAttempt = { authorityKey, baseline, input };
    const operation = this.begin(authorityKey, resourceId, "updating");
    if (!operation) return false;

    try {
      const result = await this.api.update(resourceId, input, operation.controller.signal);
      if (!this.isCurrent(operation)) return false;
      if (!resourceMetadataMatches(result.resource, baseline, input)) {
        this.setResult(operation, baseline, "uncertain", null);
        return false;
      }
      this.setResult(operation, result.resource, "saved", null);
      return true;
    } catch (error) {
      if (!this.isCurrent(operation)) return false;
      const conflict =
        error instanceof ApiRequestError &&
        error.code === "RESOURCE_REVISION_CONFLICT";
      const failure = resourceConsumptionFailure(error);
      const ambiguous =
        !conflict &&
        (failure === "offline" ||
          failure === "timeout" ||
          failure === "server_unavailable" ||
          failure === "error");

      if (!conflict && !ambiguous) {
        this.lastAttempt = null;
        this.setResult(operation, baseline, "none", failure);
        return false;
      }

      // A network failure may occur after the backend accepted PATCH.
      await this.readAfterUpdate(operation, baseline, input, conflict);
      return this.current(authorityKey, resourceId)?.outcome === "saved";
    } finally {
      this.finish(operation);
    }
  }

  async refresh(authorityKey: string, resourceId: string): Promise<boolean> {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy || current.outcome !== "uncertain") return false;
    const operation = this.begin(authorityKey, resourceId, "refreshing");
    if (!operation) return false;
    try {
      const result = await this.api.resource(resourceId, operation.controller.signal);
      if (!this.isCurrent(operation)) return false;
      const attempt = this.lastAttempt;
      const saved = Boolean(
        attempt &&
          attempt.authorityKey === authorityKey &&
          resourceMetadataMatches(result.resource, attempt.baseline, attempt.input),
      );
      this.setResult(operation, result.resource, saved ? "saved" : "conflict", null);
      return true;
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.setResult(operation, current.resource, "uncertain", resourceConsumptionFailure(error));
      }
      return false;
    } finally {
      this.finish(operation);
    }
  }

  suspend(authorityKey: string): void {
    if (this.snapshot.kind !== "ready" || this.snapshot.authorityKey !== authorityKey) return;
    const current = this.snapshot;
    this.abort();
    this.publish({
      ...current,
      busy: null,
      outcome: current.busy === "updating" ? "uncertain" : current.outcome,
    });
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey !== authorityKey
    ) return;
    this.abort();
    this.lastAttempt = null;
    this.publish({ kind: "idle" });
  }

  private async readAfterUpdate(
    operation: Operation,
    baseline: ResourceView,
    input: ResourceMetadataUpdateInput,
    confirmedConflict: boolean,
  ): Promise<void> {
    try {
      const { resource } = await this.api.resource(
        operation.resourceId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const matched = resourceMetadataMatches(resource, baseline, input);
      this.setResult(
        operation,
        resource,
        matched ? "saved" : confirmedConflict || resource.revision > baseline.revision
          ? "conflict"
          : "uncertain",
        null,
      );
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.setResult(
          operation,
          baseline,
          "uncertain",
          resourceConsumptionFailure(error),
        );
      }
    }
  }

  private begin(
    authorityKey: string,
    resourceId: string,
    busy: Ready["busy"],
  ): Operation | null {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy || this.active) return null;
    const operation = {
      authorityKey,
      resourceId,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({ ...current, busy, failure: null });
    return operation;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private setResult(
    operation: Operation,
    resource: ResourceView,
    outcome: Ready["outcome"],
    failure: ResourceConsumptionFailure | null,
  ): void {
    const current = this.current(operation.authorityKey, operation.resourceId);
    if (current && this.isCurrent(operation)) {
      this.publish({ ...current, resource, outcome, failure });
    }
  }

  private finish(operation: Operation): void {
    if (this.active !== operation) return;
    this.active = null;
    const current = this.current(operation.authorityKey, operation.resourceId);
    if (current) this.publish({ ...current, busy: null });
  }

  private abort(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }

  private current(authorityKey: string, resourceId: string): Ready | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.resource.id === resourceId
      ? this.snapshot
      : null;
  }

  private publish(snapshot: MobileResourceMetadataSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
