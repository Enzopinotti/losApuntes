import { ApiRequestError } from "@/services/api/client";

import type {
  ResourceAccessResponse,
  ResourceConsumptionApi,
  ResourceSavedPage,
} from "./resource-consumption-api";

export type ResourceConsumptionFailure =
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "forbidden"
  | "not_found"
  | "restricted"
  | "error";

export function resourceConsumptionFailure(
  error: unknown,
): ResourceConsumptionFailure {
  if (!(error instanceof ApiRequestError)) return "error";
  if (error.code === "ACCOUNT_RESTRICTED") return "restricted";
  if (error.kind === "offline") return "offline";
  if (error.kind === "timeout") return "timeout";
  if (error.kind === "server_unavailable") return "server_unavailable";
  if (error.kind === "forbidden") return "forbidden";
  if (error.status === 404 || error.kind === "gone") return "not_found";
  return "error";
}

export type MobileResourceDetailSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      resourceId: string;
      saved: boolean | null;
      busy: "access" | "save" | "unsave" | null;
      failure: ResourceConsumptionFailure | null;
    };

type DetailListener = (snapshot: MobileResourceDetailSnapshot) => void;

type DetailOperation = {
  authorityKey: string;
  resourceId: string;
  generation: number;
  controller: AbortController;
};

export class MobileResourceDetailController {
  private snapshot: MobileResourceDetailSnapshot = { kind: "idle" };
  private listeners = new Set<DetailListener>();
  private generation = 0;
  private active: DetailOperation | null = null;

  constructor(private readonly api: ResourceConsumptionApi) {}

  getSnapshot(): MobileResourceDetailSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DetailListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScope(
    authorityKey: string,
    resourceId: string,
    initialSaved: boolean | null = null,
  ): void {
    const current = this.current(authorityKey, resourceId);
    if (current) return;

    this.cancel();
    this.publish({
      kind: "ready",
      authorityKey,
      resourceId,
      saved: initialSaved,
      busy: null,
      failure: null,
    });
  }

  async access(
    authorityKey: string,
    resourceId: string,
  ): Promise<ResourceAccessResponse | null> {
    const operation = this.begin(authorityKey, resourceId, "access");
    if (!operation) return null;

    try {
      const result = await this.api.access(
        resourceId,
        "inline",
        operation.controller.signal,
      );
      return this.isCurrent(operation) ? result : null;
    } catch (error) {
      if (this.isCurrent(operation)) this.fail(operation, error);
      return null;
    } finally {
      this.finish(operation);
    }
  }

  async save(authorityKey: string, resourceId: string): Promise<void> {
    const operation = this.begin(authorityKey, resourceId, "save");
    if (!operation) return;

    try {
      await this.api.save(resourceId, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      const current = this.current(authorityKey, resourceId);
      if (current) this.publish({ ...current, saved: true, failure: null });
    } catch (error) {
      if (this.isCurrent(operation)) this.fail(operation, error);
    } finally {
      this.finish(operation);
    }
  }

  async unsave(authorityKey: string, resourceId: string): Promise<void> {
    const operation = this.begin(authorityKey, resourceId, "unsave");
    if (!operation) return;

    try {
      await this.api.unsave(resourceId, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      const current = this.current(authorityKey, resourceId);
      if (current) this.publish({ ...current, saved: false, failure: null });
    } catch (error) {
      if (this.isCurrent(operation)) this.fail(operation, error);
    } finally {
      this.finish(operation);
    }
  }

  suspend(authorityKey: string): void {
    if (
      this.snapshot.kind !== "ready" ||
      this.snapshot.authorityKey !== authorityKey
    ) {
      return;
    }

    const current = this.snapshot;
    this.cancel();
    this.publish({ ...current, busy: null });
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey !== authorityKey
    ) {
      return;
    }

    this.cancel();
    this.publish({ kind: "idle" });
  }

  private begin(
    authorityKey: string,
    resourceId: string,
    busy: "access" | "save" | "unsave",
  ): DetailOperation | null {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy !== null) return null;

    this.generation += 1;
    const operation: DetailOperation = {
      authorityKey,
      resourceId,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({ ...current, busy, failure: null });
    return operation;
  }

  private isCurrent(operation: DetailOperation): boolean {
    return (
      this.active === operation &&
      operation.generation === this.generation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private fail(operation: DetailOperation, error: unknown): void {
    const current = this.current(operation.authorityKey, operation.resourceId);
    if (!current) return;
    this.publish({
      ...current,
      failure: resourceConsumptionFailure(error),
    });
  }

  private finish(operation: DetailOperation): void {
    if (this.active !== operation) return;
    this.active = null;
    const current = this.current(operation.authorityKey, operation.resourceId);
    if (current) this.publish({ ...current, busy: null });
  }

  private cancel(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }

  private current(
    authorityKey: string,
    resourceId: string,
  ): Extract<MobileResourceDetailSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.resourceId === resourceId
      ? this.snapshot
      : null;
  }

  private publish(snapshot: MobileResourceDetailSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

export type MobileSavedResourcesSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "failure";
      authorityKey: string;
      failure: ResourceConsumptionFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      data: ResourceSavedPage;
      loadingMore: boolean;
      failure: ResourceConsumptionFailure | null;
    };

type SavedListener = (snapshot: MobileSavedResourcesSnapshot) => void;

type SavedOperation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
};

function appendUniqueResources(
  current: ResourceSavedPage["items"],
  next: ResourceSavedPage["items"],
): ResourceSavedPage["items"] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

export class MobileSavedResourcesController {
  private snapshot: MobileSavedResourcesSnapshot = { kind: "idle" };
  private listeners = new Set<SavedListener>();
  private authorityKey: string | null = null;
  private generation = 0;
  private active: SavedOperation | null = null;

  constructor(private readonly api: ResourceConsumptionApi) {}

  getSnapshot(): MobileSavedResourcesSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SavedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string): Promise<void> {
    this.authorityKey = authorityKey;
    const operation = this.begin(authorityKey);
    this.publish({ kind: "loading", authorityKey });

    try {
      const data = await this.api.saved(undefined, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        data,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        failure: resourceConsumptionFailure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (
      !current ||
      !current.data.nextCursor ||
      current.loadingMore ||
      this.active
    )
      return;

    const operation = this.begin(authorityKey);
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const next = await this.api.saved(
        current.data.nextCursor,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        data: {
          items: appendUniqueResources(latest.data.items, next.items),
          nextCursor: next.nextCursor,
        },
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
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

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;

    this.authorityKey = null;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  suspend(authorityKey: string): void {
    if (authorityKey !== this.authorityKey) return;

    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;

    const current = this.currentReady(authorityKey);
    if (current) {
      this.publish({ ...current, loadingMore: false });
    } else {
      this.publish({ kind: "idle" });
    }
  }

  private begin(authorityKey: string): SavedOperation {
    this.generation += 1;
    this.active?.controller.abort();
    const operation = {
      authorityKey,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    return operation;
  }

  private isCurrent(operation: SavedOperation): boolean {
    return (
      this.active === operation &&
      operation.generation === this.generation &&
      operation.authorityKey === this.authorityKey &&
      !operation.controller.signal.aborted
    );
  }

  private finish(operation: SavedOperation): void {
    if (this.active === operation) this.active = null;
  }

  private currentReady(
    authorityKey: string,
  ): Extract<MobileSavedResourcesSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private publish(snapshot: MobileSavedResourcesSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
