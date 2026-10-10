import type {
  AcademicCatalogNode,
  AcademicCatalogSearchResponse,
} from "@losapuntes/contracts";

import { ApiRequestError, type ApiFailureKind } from "@/services/api/client";

const INSTITUTION_SEARCH_LIMIT = 25;

export type AcademicInstitutionSearchSnapshot =
  | { kind: "idle"; authorityKey: string | null }
  | { kind: "loading"; authorityKey: string; query: string }
  | {
      kind: "ready";
      authorityKey: string;
      query: string;
      items: AcademicCatalogNode[];
      nextCursor: string | null;
      loadingMore: boolean;
      failure: ApiFailureKind | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      query: string;
      failure: ApiFailureKind;
    };

type Listener = (snapshot: AcademicInstitutionSearchSnapshot) => void;

export interface AcademicInstitutionSearchApi {
  catalogSearch(
    input: {
      kind: "institution";
      q: string;
      limit: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ): Promise<AcademicCatalogSearchResponse>;
}

const failureKind = (error: unknown): ApiFailureKind =>
  error instanceof ApiRequestError ? error.kind : "unexpected";

export class AcademicInstitutionSearchController {
  private snapshot: AcademicInstitutionSearchSnapshot = {
    kind: "idle",
    authorityKey: null,
  };
  private listeners = new Set<Listener>();
  private generation = 0;
  private authorityKey: string | null = null;
  private activeSearch: AbortController | null = null;

  constructor(private readonly api: AcademicInstitutionSearchApi) {}

  getSnapshot(): AcademicInstitutionSearchSnapshot {
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
    this.publish({ kind: "idle", authorityKey });
  }

  async search(authorityKey: string, rawQuery: string): Promise<void> {
    const query = rawQuery.trim();
    if (
      this.authorityKey !== authorityKey ||
      query.length < 2 ||
      query.length > 120
    ) {
      return;
    }

    const generation = this.startSearch();
    const signal = this.activeSearch?.signal;
    this.publish({ kind: "loading", authorityKey, query });

    try {
      const response = await this.api.catalogSearch(
        { kind: "institution", q: query, limit: INSTITUTION_SEARCH_LIMIT },
        signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        query,
        items: response.items.filter(
          (item) => item.kind === "institution" && item.status === "active",
        ),
        nextCursor: response.nextCursor,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        query,
        failure: failureKind(error),
      });
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.snapshot;
    if (
      this.authorityKey !== authorityKey ||
      current.kind !== "ready" ||
      current.authorityKey !== authorityKey ||
      current.loadingMore ||
      !current.nextCursor
    ) {
      return;
    }

    const generation = this.startSearch();
    const signal = this.activeSearch?.signal;
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const response = await this.api.catalogSearch(
        {
          kind: "institution",
          q: current.query,
          limit: INSTITUTION_SEARCH_LIMIT,
          cursor: current.nextCursor,
        },
        signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      const latest = this.snapshot;
      if (
        latest.kind !== "ready" ||
        latest.authorityKey !== authorityKey ||
        latest.query !== current.query
      ) {
        return;
      }
      const items = new Map(latest.items.map((item) => [item.id, item]));
      for (const item of response.items) {
        if (item.kind === "institution" && item.status === "active") {
          items.set(item.id, item);
        }
      }
      this.publish({
        ...latest,
        items: [...items.values()],
        nextCursor: response.nextCursor,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      const latest = this.snapshot;
      if (
        latest.kind !== "ready" ||
        latest.authorityKey !== authorityKey ||
        latest.query !== current.query
      ) {
        return;
      }
      this.publish({
        ...latest,
        loadingMore: false,
        failure: failureKind(error),
      });
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.generation += 1;
    this.activeSearch?.abort();
    this.activeSearch = null;
  }

  private startSearch(): number {
    this.generation += 1;
    this.activeSearch?.abort();
    this.activeSearch = new AbortController();
    return this.generation;
  }

  private isCurrent(generation: number, authorityKey: string): boolean {
    return this.generation === generation && this.authorityKey === authorityKey;
  }

  private publish(snapshot: AcademicInstitutionSearchSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
