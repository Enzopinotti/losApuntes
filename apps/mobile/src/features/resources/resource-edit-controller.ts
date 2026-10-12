import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";
import type { ResourceEditApi } from "./resource-edit-api";
import {
  validateResourceEdit,
  type ResourceEditDraft,
} from "./resource-edit-policy";

export type ResourceEditOutcome =
  | "none"
  | "saved"
  | "conflict"
  | "uncertain";

export type ResourceEditFailure =
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "forbidden"
  | "restricted"
  | "validation"
  | "error";

export type ResourceEditSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      resource: ResourceView;
      sending: boolean;
      outcome: ResourceEditOutcome;
      failure: ResourceEditFailure | null;
    };

type Ready = Extract<ResourceEditSnapshot, { kind: "ready" }>;
type Listener = (snapshot: ResourceEditSnapshot) => void;
type Operation = {
  authorityKey: string;
  resourceId: string;
  generation: number;
  controller: AbortController;
};

function editFailure(error: unknown): ResourceEditFailure {
  if (!(error instanceof ApiRequestError)) return "error";
  if (error.code === "ACCOUNT_RESTRICTED") return "restricted";
  if (error.kind === "offline") return "offline";
  if (error.kind === "timeout") return "timeout";
  if (error.kind === "server_unavailable") return "server_unavailable";
  if (error.kind === "forbidden" || error.kind === "unauthorized") {
    return "forbidden";
  }
  if (error.kind === "validation") return "validation";
  return "error";
}

/**
 * One PATCH at a time. On ambiguous transport failures, block another PATCH
 * until a fresh server read establishes the actual revision.
 */
export class MobileResourceEditController {
  private snapshot: ResourceEditSnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private active: Operation | null = null;
  private generation = 0;

  constructor(private readonly api: ResourceEditApi) {}

  getSnapshot(): ResourceEditSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScope(authorityKey: string, resource: ResourceView): void {
    const current = this.current(authorityKey, resource.id);
    if (current) {
      // A newer GET resolves an optimistic-lock conflict or uncertain POST.
      if (resource.revision > current.resource.revision) {
        this.abort();
        this.publish({
          ...current,
          resource,
          sending: false,
          outcome: "none",
          failure: null,
        });
      }
      return;
    }
    this.abort();
    this.publish({
      kind: "ready",
      authorityKey,
      resource,
      sending: false,
      outcome: "none",
      failure: null,
    });
  }

  async submit(
    authorityKey: string,
    resourceId: string,
    draft: ResourceEditDraft,
  ): Promise<ResourceView | null> {
    const current = this.current(authorityKey, resourceId);
    if (
      !current ||
      !current.resource.capabilities.edit ||
      current.sending ||
      current.outcome === "uncertain" ||
      current.outcome === "conflict"
    ) {
      return null;
    }
    const validation = validateResourceEdit(current.resource, draft);
    if (validation.kind !== "valid") return null;

    const operation: Operation = {
      authorityKey,
      resourceId,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({
      ...current,
      sending: true,
      outcome: "none",
      failure: null,
    });

    try {
      const response = await this.api.update(
        resourceId,
        validation.patch,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return null;
      this.publish({
        ...this.current(authorityKey, resourceId)!,
        resource: response.resource,
        outcome: "saved",
        failure: null,
      });
      return response.resource;
    } catch (error) {
      if (!this.isCurrent(operation)) return null;
      const failure = editFailure(error);
      const outcome: ResourceEditOutcome =
        error instanceof ApiRequestError && error.status === 409
          ? "conflict"
          : failure === "offline" ||
              failure === "timeout" ||
              failure === "server_unavailable"
            ? "uncertain"
            : "none";
      this.publish({
        ...this.current(authorityKey, resourceId)!,
        outcome,
        failure: outcome === "conflict" ? null : failure,
      });
      return null;
    } finally {
      if (this.active === operation) {
        this.active = null;
        const latest = this.current(authorityKey, resourceId);
        if (latest) this.publish({ ...latest, sending: false });
      }
    }
  }

  suspend(authorityKey: string): void {
    const current = this.snapshot;
    if (current.kind !== "ready" || current.authorityKey !== authorityKey) {
      return;
    }
    const wasSending = current.sending;
    this.abort();
    this.publish({
      ...current,
      sending: false,
      outcome: wasSending ? "uncertain" : current.outcome,
      failure: null,
    });
  }

  invalidate(): void {
    this.abort();
    this.publish({ kind: "idle" });
  }

  private current(authorityKey: string, resourceId: string): Ready | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.resource.id === resourceId
      ? this.snapshot
      : null;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private abort(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }

  private publish(snapshot: ResourceEditSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
