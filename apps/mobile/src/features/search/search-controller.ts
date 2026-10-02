import type {
  ContextualDiscoveryResponse,
  SearchResponse,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { MobileSearchApi, MobileSearchInput } from "./search-api";

type SearchFailureKind =
  "offline" | "timeout" | "server_unavailable" | "restricted" | "error";

type FailureSnapshot = {
  kind: SearchFailureKind;
  authorityKey: string;
  code: string | null;
};

export type MobileSearchSnapshot =
  | { kind: "idle" }
  | {
      kind: "loading";
      authorityKey: string;
      query: string;
      scope: MobileSearchInput["scope"];
    }
  | {
      kind: "ready";
      authorityKey: string;
      query: string;
      scope: MobileSearchInput["scope"];
      data: SearchResponse;
    }
  | FailureSnapshot;

export type ContextualDiscoverySnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      data: ContextualDiscoveryResponse;
    }
  | FailureSnapshot;

type Listener = () => void;

const failure = (error: unknown, authorityKey: string): FailureSnapshot => {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "error", authorityKey, code: null };
  }

  if (error.code === "ACCOUNT_RESTRICTED") {
    return { kind: "restricted", authorityKey, code: error.code };
  }
  if (error.kind === "offline") {
    return { kind: "offline", authorityKey, code: error.code };
  }
  if (error.kind === "timeout") {
    return { kind: "timeout", authorityKey, code: error.code };
  }
  if (error.kind === "server_unavailable") {
    return { kind: "server_unavailable", authorityKey, code: error.code };
  }

  return { kind: "error", authorityKey, code: error.code };
};

export class MobileSearchController {
  private searchSnapshot: MobileSearchSnapshot = { kind: "idle" };
  private contextualSnapshot: ContextualDiscoverySnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private searchGeneration = 0;
  private contextualGeneration = 0;
  private searchOperation: AbortController | null = null;
  private contextualOperation: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduledSearchAuthority: string | null = null;

  constructor(private readonly api: MobileSearchApi) {}

  getSearchSnapshot(): MobileSearchSnapshot {
    return this.searchSnapshot;
  }

  getContextualSnapshot(): ContextualDiscoverySnapshot {
    return this.contextualSnapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async search(authorityKey: string, input: MobileSearchInput): Promise<void> {
    this.clearScheduledSearch();
    const generation = this.startSearch(authorityKey, input);
    const signal = this.searchOperation?.signal;

    try {
      const data = await this.api.search(input, signal);
      if (!this.isCurrentSearch(generation, authorityKey)) return;
      this.searchSnapshot = {
        kind: "ready",
        authorityKey,
        query: input.q ?? "",
        scope: input.scope,
        data,
      };
      this.publish();
    } catch (error) {
      if (!this.isCurrentSearch(generation, authorityKey)) return;
      this.searchSnapshot = failure(error, authorityKey);
      this.publish();
    }
  }

  async loadContextual(authorityKey: string): Promise<void> {
    const generation = this.startContextual(authorityKey);
    const signal = this.contextualOperation?.signal;

    try {
      const data = await this.api.contextualDiscovery(signal);
      if (!this.isCurrentContextual(generation, authorityKey)) return;
      this.contextualSnapshot = { kind: "ready", authorityKey, data };
      this.publish();
    } catch (error) {
      if (!this.isCurrentContextual(generation, authorityKey)) return;
      this.contextualSnapshot = failure(error, authorityKey);
      this.publish();
    }
  }

  scheduleSearch(
    authorityKey: string,
    input: MobileSearchInput,
    delayMs = 300,
  ): void {
    this.cancelSearch();
    const generation = this.searchGeneration;
    this.scheduledSearchAuthority = authorityKey;
    this.debounceTimer = setTimeout(() => {
      if (
        generation !== this.searchGeneration ||
        this.scheduledSearchAuthority !== authorityKey
      ) {
        return;
      }

      this.clearScheduledSearch();
      void this.search(authorityKey, input);
    }, delayMs);
  }

  cancelSearch(authorityKey?: string): void {
    const activeAuthority =
      this.searchSnapshot.kind === "idle"
        ? null
        : this.searchSnapshot.authorityKey;
    if (
      authorityKey &&
      activeAuthority !== authorityKey &&
      this.scheduledSearchAuthority !== authorityKey
    ) {
      return;
    }

    this.searchGeneration += 1;
    this.clearScheduledSearch();
    this.searchOperation?.abort();
    this.searchOperation = null;
    this.searchSnapshot = { kind: "idle" };
    this.publish();
  }

  invalidate(authorityKey?: string): void {
    let changed = false;
    const activeSearchAuthority =
      this.searchSnapshot.kind === "idle"
        ? null
        : this.searchSnapshot.authorityKey;

    if (
      !authorityKey ||
      activeSearchAuthority === authorityKey ||
      this.scheduledSearchAuthority === authorityKey
    ) {
      this.searchGeneration += 1;
      this.clearScheduledSearch();
      this.searchOperation?.abort();
      this.searchOperation = null;
      this.searchSnapshot = { kind: "idle" };
      changed = true;
    }

    if (
      !authorityKey ||
      (this.contextualSnapshot.kind !== "idle" &&
        this.contextualSnapshot.authorityKey === authorityKey)
    ) {
      this.contextualGeneration += 1;
      this.contextualOperation?.abort();
      this.contextualOperation = null;
      this.contextualSnapshot = { kind: "idle" };
      changed = true;
    }

    if (changed) this.publish();
  }

  private startSearch(authorityKey: string, input: MobileSearchInput): number {
    this.searchGeneration += 1;
    this.searchOperation?.abort();
    this.searchOperation = new AbortController();
    this.searchSnapshot = {
      kind: "loading",
      authorityKey,
      query: input.q ?? "",
      scope: input.scope,
    };
    this.publish();
    return this.searchGeneration;
  }

  private startContextual(authorityKey: string): number {
    this.contextualGeneration += 1;
    this.contextualOperation?.abort();
    this.contextualOperation = new AbortController();
    this.contextualSnapshot = { kind: "loading", authorityKey };
    this.publish();
    return this.contextualGeneration;
  }

  private isCurrentSearch(generation: number, authorityKey: string): boolean {
    return (
      generation === this.searchGeneration &&
      this.searchSnapshot.kind !== "idle" &&
      this.searchSnapshot.authorityKey === authorityKey
    );
  }

  private isCurrentContextual(
    generation: number,
    authorityKey: string,
  ): boolean {
    return (
      generation === this.contextualGeneration &&
      this.contextualSnapshot.kind !== "idle" &&
      this.contextualSnapshot.authorityKey === authorityKey
    );
  }

  private clearScheduledSearch(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.scheduledSearchAuthority = null;
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}
