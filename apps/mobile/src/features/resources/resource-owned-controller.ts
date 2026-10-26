import type {
  OwnedResourcesPage,
  ResourceView,
  ResourceVisibility,
} from "@losapuntes/contracts";

import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import type {
  OwnedResourcesApi,
  OwnedResourcesQuery,
} from "./resource-owned-api";

export type OwnedLibraryFilters = {
  visibility: ResourceVisibility | null;
  q: string | null;
  subjectId: string | null;
  order: "newest" | "oldest";
};

export type OwnedResourcesSnapshot =
  | { kind: "idle" }
  | {
      kind: "loading";
      authorityKey: string;
      visibility: ResourceVisibility | null;
      filters: OwnedLibraryFilters;
    }
  | {
      kind: "failure";
      authorityKey: string;
      visibility: ResourceVisibility | null;
      filters: OwnedLibraryFilters;
      failure: ResourceConsumptionFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      visibility: ResourceVisibility | null;
      filters: OwnedLibraryFilters;
      data: OwnedResourcesPage;
      cursorRepeated: boolean;
      loadingMore: boolean;
      failure: ResourceConsumptionFailure | null;
    };

type Listener = (snapshot: OwnedResourcesSnapshot) => void;
type Operation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
  filters: OwnedLibraryFilters;
};

function normalizeFilters(
  visibility: ResourceVisibility | null,
  query: Pick<OwnedResourcesQuery, "q" | "subjectId" | "order"> = {},
): OwnedLibraryFilters {
  return {
    visibility,
    q:
      query.q
        ?.normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ")
        .toLocaleLowerCase("es-AR") || null,
    subjectId: query.subjectId || null,
    order: query.order ?? "newest",
  };
}

function serverQuery(filters: OwnedLibraryFilters): OwnedResourcesQuery {
  return {
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.order !== "newest" ? { order: filters.order } : {}),
  };
}

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

/** Paginated owner results are scoped by account, query, subject, visibility and sort. */
export class MobileOwnedResourcesController {
  private snapshot: OwnedResourcesSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: Operation | null = null;
  private readonly requestedCursors = new Set<string>();

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
    query: Pick<OwnedResourcesQuery, "q" | "subjectId" | "order"> = {},
  ): Promise<void> {
    const filters = normalizeFilters(visibility, query);
    this.requestedCursors.clear();
    const operation = this.begin(authorityKey, filters);
    this.publish({ kind: "loading", authorityKey, visibility, filters });

    try {
      const data = await this.api.listOwned(
        serverQuery(filters),
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        visibility,
        filters,
        data,
        cursorRepeated: false,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.publish({
          kind: "failure",
          authorityKey,
          visibility,
          filters,
          failure: resourceConsumptionFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    const cursor = current?.data.nextCursor;
    if (!current || !cursor || current.loadingMore || this.active) {
      return;
    }

    if (this.requestedCursors.has(cursor)) {
      this.publish({
        ...current,
        data: { ...current.data, nextCursor: null },
        cursorRepeated: true,
      });
      return;
    }

    const operation = this.begin(authorityKey, current.filters);
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const next = await this.api.listOwned(
        { ...serverQuery(current.filters), cursor },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest || latest.filters !== operation.filters) return;
      const cursorRepeated =
        next.nextCursor !== null &&
        (next.nextCursor === cursor ||
          this.requestedCursors.has(next.nextCursor));
      this.requestedCursors.add(cursor);
      this.publish({
        ...latest,
        data: {
          items: appendUnique(latest.data.items, next.items),
          nextCursor: cursorRepeated ? null : next.nextCursor,
        },
        cursorRepeated: latest.cursorRepeated || cursorRepeated,
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
    this.invalidate(authorityKey);
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind !== "idle" &&
      this.snapshot.authorityKey !== authorityKey
    )
      return;
    this.requestedCursors.clear();
    this.cancel();
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string, filters: OwnedLibraryFilters): Operation {
    this.cancel();
    const operation: Operation = {
      authorityKey,
      filters,
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
      this.snapshot.filters === operation.filters
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
