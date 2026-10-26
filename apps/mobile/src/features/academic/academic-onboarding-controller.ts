import type {
  AcademicCatalogNode,
  AcademicCatalogSearchResponse,
  AcademicNodeKind,
} from "@losapuntes/contracts";

import { ApiRequestError, type ApiFailureKind } from "@/services/api/client";

const CATALOG_SEARCH_LIMIT = 25;

type OnboardingCatalogKind = Extract<
  AcademicNodeKind,
  "institution" | "program" | "subject"
>;

interface OnboardingCatalogSearchInput {
  kind: OnboardingCatalogKind;
  q: string;
  limit: number;
  cursor?: string;
  parentId?: string;
}

export type AcademicCatalogSearchSnapshot =
  | { kind: "idle"; authorityKey: string | null }
  | { kind: "loading"; authorityKey: string; query: string }
  | {
      kind: "ready";
      authorityKey: string;
      query: string;
      items: AcademicCatalogNode[];
      nextCursor: string | null;
      cursorRepeated: boolean;
      loadingMore: boolean;
      failure: ApiFailureKind | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      query: string;
      failure: ApiFailureKind;
    };

type Listener = (snapshot: AcademicCatalogSearchSnapshot) => void;

export interface AcademicCatalogSearchApi {
  catalogSearch(
    input: OnboardingCatalogSearchInput,
    signal?: AbortSignal,
  ): Promise<AcademicCatalogSearchResponse>;
}

const failureKind = (error: unknown): ApiFailureKind =>
  error instanceof ApiRequestError ? error.kind : "unexpected";

export class AcademicCatalogSearchController {
  private snapshot: AcademicCatalogSearchSnapshot = {
    kind: "idle",
    authorityKey: null,
  };
  private listeners = new Set<Listener>();
  private generation = 0;
  private authorityKey: string | null = null;
  private activeSearch: AbortController | null = null;
  private readonly requestedCursors = new Set<string>();

  constructor(
    private readonly api: AcademicCatalogSearchApi,
    private readonly kind: OnboardingCatalogKind = "institution",
    private readonly parentId?: string,
  ) {}

  getSnapshot(): AcademicCatalogSearchSnapshot {
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
    this.requestedCursors.clear();
    const signal = this.activeSearch?.signal;
    this.publish({ kind: "loading", authorityKey, query });

    try {
      const response = await this.api.catalogSearch(
        {
          kind: this.kind,
          q: query,
          limit: CATALOG_SEARCH_LIMIT,
          ...(this.parentId ? { parentId: this.parentId } : {}),
        },
        signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        query,
        items: response.items.filter(
          (item) => item.kind === this.kind && item.status === "active",
        ),
        nextCursor: response.nextCursor,
        cursorRepeated: false,
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

    const cursor = current.nextCursor;
    if (this.requestedCursors.has(cursor)) {
      this.publish({
        ...current,
        nextCursor: null,
        cursorRepeated: true,
      });
      return;
    }

    const generation = this.startSearch();
    const signal = this.activeSearch?.signal;
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const response = await this.api.catalogSearch(
        {
          kind: this.kind,
          q: current.query,
          limit: CATALOG_SEARCH_LIMIT,
          cursor,
          ...(this.parentId ? { parentId: this.parentId } : {}),
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
        if (item.kind === this.kind && item.status === "active") {
          items.set(item.id, item);
        }
      }
      this.requestedCursors.add(cursor);
      const cursorRepeated =
        response.nextCursor !== null &&
        (response.nextCursor === cursor ||
          this.requestedCursors.has(response.nextCursor));
      this.publish({
        ...latest,
        items: [...items.values()],
        nextCursor: cursorRepeated ? null : response.nextCursor,
        cursorRepeated: latest.cursorRepeated || cursorRepeated,
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
    this.requestedCursors.clear();
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

  private publish(snapshot: AcademicCatalogSearchSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
