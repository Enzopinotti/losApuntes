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
  if (error.code === "RESOURCE_SAVED_QUERY_TIMEOUT") return "timeout";
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
      notice: "saved" | "unsaved" | null;
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
      notice: null,
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
      if (current) {
        this.publish({
          ...current,
          saved: true,
          failure: null,
          notice: "saved",
        });
      }
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
      if (current) {
        this.publish({
          ...current,
          saved: false,
          failure: null,
          notice: "unsaved",
        });
      }
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
    this.publish({ ...current, busy: null, notice: null });
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
    this.publish({ ...current, busy, failure: null, notice: null });
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
  | { kind: "loading"; authorityKey: string; searchQuery?: string; subjectId?: string; order?: "title" }
  | {
      kind: "failure";
      authorityKey: string;
      failure: ResourceConsumptionFailure;
      searchQuery?: string;
      subjectId?: string;
      order?: 'title';
    }
  | {
      kind: "ready";
      authorityKey: string;
      searchQuery?: string;
      subjectId?: string;
      order?: 'title';
      data: ResourceSavedPage;
      loadingMore: boolean;
      syncing: boolean;
      syncFailure: ResourceConsumptionFailure | null;
      syncNotice: "updated" | null;
      paginationStalled: boolean;
      paginationResetReason?: 'cursor_cycle' | 'data_changed' | undefined;
      failure: ResourceConsumptionFailure | null;
      removingResourceId: string | null;
      removalFailure: {
        resourceId: string;
        failure: ResourceConsumptionFailure;
      } | null;
      notice: {
        operationId: number;
        resourceId: string;
        resourceTitle: string;
      } | null;
    };

type SavedListener = (snapshot: MobileSavedResourcesSnapshot) => void;

type SavedOperation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
  kind: "load" | "loadMore" | "remove" | "sync";
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
  private activeSearchQuery: string | null = null;
  private activeSubjectId: string | null = null;
  private activeOrder: 'saved' | 'title' = 'saved';
  private readonly usedPageCursors = new Set<string>();
  private firstPageLength = 0;
  private firstPageCursor: string | null = null;
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

  async load(authorityKey: string, query?: string, subjectId?: string, order: 'saved' | 'title' = 'saved'): Promise<void> {
    if (
      this.active?.kind === "remove" &&
      this.active.authorityKey === authorityKey
    ) {
      return;
    }

    this.authorityKey = authorityKey;
    const searchQuery = query?.trim() || null;
    this.activeSearchQuery = searchQuery;
    this.activeSubjectId = subjectId ?? null;
    this.activeOrder = order;
    this.usedPageCursors.clear();
    this.firstPageLength = 0;
    this.firstPageCursor = null;
    const scope = {
      ...(searchQuery ? { searchQuery } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(order === 'title' ? { order: 'title' as const } : {}),
    };
    const operation = this.begin(authorityKey, "load");
    this.publish({ kind: "loading", authorityKey, ...scope });

    try {
      const data = await this.api.saved(undefined, operation.controller.signal, searchQuery ?? undefined, subjectId, order);
      if (!this.isCurrent(operation)) return;
      this.firstPageLength = data.items.length;
      this.firstPageCursor = data.nextCursor;
      this.publish({
        kind: "ready",
        authorityKey,
        ...scope,
        data,
        loadingMore: false,
        syncing: false,
        syncFailure: null,
        syncNotice: null,
        paginationStalled: false,
        paginationResetReason: undefined,
        failure: null,
        removingResourceId: null,
        removalFailure: null,
        notice: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        ...scope,
        failure: resourceConsumptionFailure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  /**
   * Foreground-only cross-device reconciliation. Checks one currently
   * authorized first page, never uses a previously paginated cursor, and
   * does not interrupt remove, loadMore or an explicit refresh.
   *
   * Old continuation pages are discarded when the first page changes, so
   * the controller cannot combine two different page generations.
   */
  async sync(authorityKey: string): Promise<void> {
    const previous = this.currentReady(authorityKey);
    if (!previous || this.active || previous.syncing || previous.removingResourceId) return;

    const operation = this.begin(authorityKey, "sync");
    this.publish({ ...previous, syncing: true, syncFailure: null });

    try {
      const first = await this.api.saved(
        undefined,
        operation.controller.signal,
        this.activeSearchQuery ?? undefined,
        this.activeSubjectId ?? undefined,
        this.activeOrder,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;

      const firstPageChanged =
        this.firstPageLength !== first.items.length ||
        this.firstPageCursor !== first.nextCursor ||
        JSON.stringify(latest.data.items.slice(0, this.firstPageLength)) !==
          JSON.stringify(first.items);

      this.firstPageLength = first.items.length;
      this.firstPageCursor = first.nextCursor;
      if (firstPageChanged) {
        this.usedPageCursors.clear();
        this.publish({
          ...latest,
          data: first,
          syncing: false,
          syncFailure: null,
          syncNotice: "updated",
          loadingMore: false,
          paginationStalled: false,
          paginationResetReason: undefined,
          failure: null,
          notice: null,
          removalFailure: null,
        });
      } else {
        this.publish({
          ...latest,
          syncing: false,
          syncFailure: null,
          syncNotice: null,
        });
      }
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          syncing: false,
          syncFailure: resourceConsumptionFailure(error),
        });
      }
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

    const requestedCursor = current.data.nextCursor;
    if (this.usedPageCursors.has(requestedCursor)) {
      this.publish({
        ...current,
        data: { ...current.data, nextCursor: null },
        paginationStalled: true,
        paginationResetReason: 'cursor_cycle',
        failure: null,
      });
      return;
    }

    const operation = this.begin(authorityKey, "loadMore");
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const next = await this.api.saved(
        requestedCursor,
        operation.controller.signal,
        this.activeSearchQuery ?? undefined,
        this.activeSubjectId ?? undefined,
        this.activeOrder,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      const repeated = next.nextCursor !== null &&
        (next.nextCursor === requestedCursor || this.usedPageCursors.has(next.nextCursor));
      this.usedPageCursors.add(requestedCursor);
      this.publish({
        ...latest,
        data: {
          items: appendUniqueResources(latest.data.items, next.items),
          nextCursor: repeated ? null : next.nextCursor,
        },
        loadingMore: false,
        paginationStalled: repeated,
        paginationResetReason: repeated ? 'cursor_cycle' : undefined,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        if (
          error instanceof ApiRequestError &&
          error.status === 409 &&
          error.code === "RESOURCE_SAVED_SEARCH_CURSOR_STALE"
        ) {
          this.publish({
            ...latest,
            data: { ...latest.data, nextCursor: null },
            loadingMore: false,
            paginationStalled: true,
            paginationResetReason: "data_changed",
            failure: null,
          });
        } else {
          this.publish({
            ...latest,
            loadingMore: false,
            failure: resourceConsumptionFailure(error),
          });
        }
      }
    } finally {
      this.finish(operation);
    }
  }

  async removeSaved(authorityKey: string, resourceId: string): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (
      !current ||
      current.removingResourceId ||
      this.active ||
      !current.data.items.some((item) => item.id === resourceId)
    ) {
      return;
    }

    const operation = this.begin(authorityKey, "remove");
    this.publish({
      ...current,
      removingResourceId: resourceId,
      removalFailure: null,
      notice: null,
    });

    try {
      await this.api.unsave(resourceId, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      const removed = latest.data.items.find((item) => item.id === resourceId);
      if (!removed) return;

      this.publish({
        ...latest,
        data: {
          ...latest.data,
          items: latest.data.items.filter((item) => item.id !== resourceId),
        },
        removingResourceId: null,
        removalFailure: null,
        notice: {
          operationId: operation.generation,
          resourceId,
          resourceTitle: removed.title,
        },
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        removingResourceId: null,
        removalFailure: {
          resourceId,
          failure: resourceConsumptionFailure(error),
        },
        notice: null,
      });
    } finally {
      this.finish(operation);
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;

    this.authorityKey = null;
    this.activeSearchQuery = null;
    this.activeSubjectId = null;
    this.activeOrder = 'saved';
    this.usedPageCursors.clear();
    this.firstPageLength = 0;
    this.firstPageCursor = null;
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
      this.publish({
        ...current,
        loadingMore: false,
        removingResourceId: null,
        removalFailure: null,
        notice: null,
      });
    } else {
      this.publish({ kind: "idle" });
    }
  }

  private begin(
    authorityKey: string,
    kind: SavedOperation["kind"],
  ): SavedOperation {
    this.generation += 1;
    this.active?.controller.abort();
    const operation = {
      authorityKey,
      generation: this.generation,
      controller: new AbortController(),
      kind,
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
