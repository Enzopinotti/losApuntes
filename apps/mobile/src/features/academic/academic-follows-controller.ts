import type {
  AcademicCatalogNode,
  AcademicCatalogSearchResponse,
} from "@losapuntes/contracts";

import { ApiRequestError, type ApiFailureKind } from "@/services/api/client";

import type {
  AcademicFollow,
  AcademicFollowListResponse,
} from "./academic-follows-api";

export type AcademicFollowTarget = Pick<
  AcademicCatalogNode,
  "id" | "kind" | "name"
>;

export interface AcademicFollowsApi {
  list(signal?: AbortSignal): Promise<AcademicFollowListResponse>;
  search(
    kind: AcademicFollow["kind"],
    query: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<AcademicCatalogSearchResponse>;
  follow(nodeId: string, signal?: AbortSignal): Promise<unknown>;
  unfollow(nodeId: string, signal?: AbortSignal): Promise<void>;
}

export interface AcademicFollowsSnapshot {
  authorityKey: string | null;
  listPhase: "idle" | "loading" | "ready" | "failure";
  listRefreshing: boolean;
  follows: AcademicFollow[];
  truncated: boolean;
  limit: number | null;
  listFailure: ApiFailureKind | null;
  kind: AcademicFollow["kind"];
  query: string;
  searchPhase: "idle" | "loading" | "ready" | "failure";
  results: AcademicCatalogNode[];
  nextCursor: string | null;
  loadingMore: boolean;
  searchFailure: ApiFailureKind | null;
  pendingTargetIds: string[];
  actionFailure: ApiFailureKind | null;
}

type Listener = (snapshot: AcademicFollowsSnapshot) => void;

const initialSnapshot = (
  authorityKey: string | null,
): AcademicFollowsSnapshot => ({
  authorityKey,
  listPhase: "idle",
  listRefreshing: false,
  follows: [],
  truncated: false,
  limit: null,
  listFailure: null,
  kind: "institution",
  query: "",
  searchPhase: "idle",
  results: [],
  nextCursor: null,
  loadingMore: false,
  searchFailure: null,
  pendingTargetIds: [],
  actionFailure: null,
});

const failureKind = (error: unknown): ApiFailureKind =>
  error instanceof ApiRequestError ? error.kind : "unexpected";

export class AcademicFollowsController {
  private snapshot: AcademicFollowsSnapshot = initialSnapshot(null);
  private readonly listeners = new Set<Listener>();
  private authorityKey: string | null = null;
  private listGeneration = 0;
  private searchGeneration = 0;
  private listAbort: AbortController | null = null;
  private searchAbort: AbortController | null = null;
  private readonly mutations = new Map<string, AbortController>();

  constructor(private readonly api: AcademicFollowsApi) {}

  getSnapshot(): AcademicFollowsSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setAuthority(authorityKey: string | null): void {
    if (this.authorityKey === authorityKey) return;
    this.invalidate();
    this.authorityKey = authorityKey;
    this.publish(initialSnapshot(authorityKey));
  }

  async load(authorityKey: string): Promise<void> {
    if (this.authorityKey !== authorityKey) return;
    this.listGeneration += 1;
    const generation = this.listGeneration;
    this.listAbort?.abort();
    this.listAbort = new AbortController();
    this.publish({
      ...this.snapshot,
      listPhase: this.snapshot.follows.length ? "ready" : "loading",
      listRefreshing: true,
      listFailure: null,
    });

    try {
      const response = await this.api.list(this.listAbort.signal);
      if (!this.isCurrentList(generation, authorityKey)) return;
      this.publish({
        ...this.snapshot,
        listPhase: "ready",
        listRefreshing: false,
        follows: response.follows,
        truncated: response.truncated,
        limit: response.limit,
        listFailure: null,
      });
    } catch (error) {
      if (!this.isCurrentList(generation, authorityKey)) return;
      this.publish({
        ...this.snapshot,
        listPhase: "failure",
        listRefreshing: false,
        listFailure: failureKind(error),
      });
    }
  }

  async search(
    authorityKey: string,
    kind: AcademicFollow["kind"],
    rawQuery: string,
  ): Promise<void> {
    const query = rawQuery.trim();
    if (this.authorityKey !== authorityKey || query.length < 2) return;
    if (query.length > 120) {
      this.publish({
        ...this.snapshot,
        kind,
        query,
        searchPhase: "failure",
        results: [],
        nextCursor: null,
        searchFailure: "validation",
      });
      return;
    }

    this.searchGeneration += 1;
    const generation = this.searchGeneration;
    this.searchAbort?.abort();
    this.searchAbort = new AbortController();
    this.publish({
      ...this.snapshot,
      kind,
      query,
      searchPhase: "loading",
      results: [],
      nextCursor: null,
      loadingMore: false,
      searchFailure: null,
      actionFailure: null,
    });

    try {
      const response = await this.api.search(
        kind,
        query,
        undefined,
        this.searchAbort.signal,
      );
      if (!this.isCurrentSearch(generation, authorityKey, query)) return;
      this.publishSearchResponse(response, kind, query);
    } catch (error) {
      if (!this.isCurrentSearch(generation, authorityKey, query)) return;
      this.publish({
        ...this.snapshot,
        searchPhase: "failure",
        results: [],
        nextCursor: null,
        searchFailure: failureKind(error),
      });
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.snapshot;
    if (
      this.authorityKey !== authorityKey ||
      current.authorityKey !== authorityKey ||
      current.searchPhase !== "ready" ||
      !current.nextCursor ||
      current.loadingMore
    ) {
      return;
    }

    this.searchGeneration += 1;
    const generation = this.searchGeneration;
    this.searchAbort?.abort();
    this.searchAbort = new AbortController();
    this.publish({ ...current, loadingMore: true, searchFailure: null });

    try {
      const response = await this.api.search(
        current.kind,
        current.query,
        current.nextCursor,
        this.searchAbort.signal,
      );
      if (
        !this.isCurrentSearch(generation, authorityKey, current.query) ||
        this.snapshot.kind !== current.kind
      ) {
        return;
      }
      const latest = this.snapshot;
      const results = new Map(latest.results.map((item) => [item.id, item]));
      for (const item of response.items) results.set(item.id, item);
      this.publish({
        ...latest,
        results: [...results.values()],
        nextCursor: response.nextCursor,
        loadingMore: false,
        searchFailure: null,
      });
    } catch (error) {
      if (!this.isCurrentSearch(generation, authorityKey, current.query))
        return;
      this.publish({
        ...this.snapshot,
        loadingMore: false,
        searchFailure: failureKind(error),
      });
    }
  }

  async toggleFollow(
    authorityKey: string,
    target: AcademicFollowTarget,
  ): Promise<void> {
    if (this.authorityKey !== authorityKey || this.mutations.has(target.id)) {
      return;
    }

    const existing = this.snapshot.follows.find(
      (follow) => follow.targetId === target.id,
    );
    const operation = new AbortController();
    this.mutations.set(target.id, operation);
    this.publish({
      ...this.snapshot,
      pendingTargetIds: [...this.mutations.keys()],
      actionFailure: null,
    });

    try {
      if (existing) {
        await this.api.unfollow(target.id, operation.signal);
      } else {
        await this.api.follow(target.id, operation.signal);
      }
      if (
        !this.mutations.has(target.id) ||
        this.authorityKey !== authorityKey
      ) {
        return;
      }
      await this.load(authorityKey);
    } catch (error) {
      if (
        !this.mutations.has(target.id) ||
        this.authorityKey !== authorityKey
      ) {
        return;
      }
      this.publish({ ...this.snapshot, actionFailure: failureKind(error) });
      await this.load(authorityKey);
    } finally {
      if (this.mutations.get(target.id) === operation) {
        this.mutations.delete(target.id);
        if (this.authorityKey === authorityKey) {
          this.publish({
            ...this.snapshot,
            pendingTargetIds: [...this.mutations.keys()],
          });
        }
      }
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.listGeneration += 1;
    this.searchGeneration += 1;
    this.listAbort?.abort();
    this.searchAbort?.abort();
    this.listAbort = null;
    this.searchAbort = null;
    for (const operation of this.mutations.values()) operation.abort();
    this.mutations.clear();
  }

  private isCurrentList(generation: number, authorityKey: string): boolean {
    return (
      this.listGeneration === generation && this.authorityKey === authorityKey
    );
  }

  private isCurrentSearch(
    generation: number,
    authorityKey: string,
    query: string,
  ): boolean {
    return (
      this.searchGeneration === generation &&
      this.authorityKey === authorityKey &&
      this.snapshot.query === query
    );
  }

  private publishSearchResponse(
    response: AcademicCatalogSearchResponse,
    kind: AcademicFollow["kind"],
    query: string,
  ): void {
    this.publish({
      ...this.snapshot,
      kind,
      query,
      searchPhase: "ready",
      results: response.items.filter(
        (item) => item.kind === kind && item.status === "active",
      ),
      nextCursor: response.nextCursor,
      loadingMore: false,
      searchFailure: null,
    });
  }

  private publish(snapshot: AcademicFollowsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
