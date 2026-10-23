import type {
  ResourceShareGrantView,
  ResourceView,
  SearchPersonResult,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { ResourceDirectSharingApi } from "./resource-direct-sharing-api";
import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";

export type ShareAction = "grant" | "revoke";
export type ShareOutcome =
  "granted" | "revoked" | "uncertain" | "error" | "visibility_changed";
export type ShareSearchState = "idle" | "loading" | "ready" | "error";

export type ResourceDirectSharingSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      resourceId: string;
      revision: number;
      visibility: ResourceView["visibility"];
      ownerProfileId: string | null;
      canManageShares: boolean;
      grantsState: "idle" | "loading" | "ready" | "error";
      grants: ResourceShareGrantView[];
      grantsNextCursor: string | null;
      grantsFailure: ResourceConsumptionFailure | "cursor_cycle" | null;
      searchState: ShareSearchState;
      query: string;
      people: SearchPersonResult[];
      selected: SearchPersonResult | null;
      busy: ShareAction | null;
      outcome: ShareOutcome | null;
      failure: ResourceConsumptionFailure | null;
    };

type Ready = Extract<ResourceDirectSharingSnapshot, { kind: "ready" }>;
type Listener = (snapshot: ResourceDirectSharingSnapshot) => void;
type Operation = {
  authorityKey: string;
  resourceId: string;
  generation: number;
  controller: AbortController;
};
export const RESOURCE_SHARE_PEOPLE_QUERY_MAX = 120;

export function validSharePeopleQuery(query: string): boolean {
  const size = query.trim().length;
  return size >= 2 && size <= RESOURCE_SHARE_PEOPLE_QUERY_MAX;
}

/**
 * Shares can be enumerated only by the server-authorized owner. Separate
 * search, pagination and mutation operations fence stale responses to the
 * same session, resource and revision.
 */
export class MobileResourceDirectSharingController {
  private snapshot: ResourceDirectSharingSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private searchOperation: Operation | null = null;
  private grantsOperation: Operation | null = null;
  private mutationOperation: Operation | null = null;
  private generation = 0;
  private grantsCursorHistory = new Set<string>();

  constructor(private readonly api: ResourceDirectSharingApi) {}

  getSnapshot(): ResourceDirectSharingSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScope(authorityKey: string, resource: ResourceView): void {
    const current = this.current(authorityKey, resource.id);
    if (
      current &&
      current.revision === resource.revision &&
      current.visibility === resource.visibility &&
      current.ownerProfileId === (resource.author?.profileId ?? null) &&
      current.canManageShares === resource.capabilities.manageShares
    )
      return;
    this.abortAll();
    this.grantsCursorHistory.clear();
    this.publish({
      kind: "ready",
      authorityKey,
      resourceId: resource.id,
      revision: resource.revision,
      visibility: resource.visibility,
      ownerProfileId: resource.author?.profileId ?? null,
      canManageShares: resource.capabilities.manageShares,
      grantsState: "idle",
      grants: [],
      grantsNextCursor: null,
      grantsFailure: null,
      searchState: "idle",
      query: "",
      people: [],
      selected: null,
      busy: null,
      outcome: null,
      failure: null,
    });
  }

  async loadGrants(
    authorityKey: string,
    resourceId: string,
    loadMore = false,
  ): Promise<void> {
    const current = this.current(authorityKey, resourceId);
    if (
      !current ||
      !current.canManageShares ||
      current.visibility !== "shared" ||
      current.outcome === "visibility_changed" ||
      current.busy ||
      this.grantsOperation ||
      (loadMore &&
        (!current.grantsNextCursor || current.grantsState !== "ready"))
    )
      return;

    if (!loadMore) this.grantsCursorHistory.clear();
    const requestedCursor = loadMore ? current.grantsNextCursor! : undefined;
    const operation = this.operation(authorityKey, resourceId);
    this.grantsOperation = operation;
    this.publish({
      ...current,
      grantsState: "loading",
      grantsFailure: null,
    });

    try {
      const result = await this.api.listGrants(
        resourceId,
        requestedCursor,
        operation.controller.signal,
      );
      if (!this.grantsCurrent(operation)) return;
      const latest = this.current(authorityKey, resourceId);
      if (!latest) return;
      if (result.resourceRevision !== latest.revision) {
        this.publish({
          ...latest,
          grantsState: "idle",
          grants: [],
          grantsNextCursor: null,
          outcome: "visibility_changed",
          selected: null,
        });
        this.grantsCursorHistory.clear();
        return;
      }
      if (requestedCursor) {
        this.grantsCursorHistory.add(requestedCursor);
      }
      const cursorCycle = Boolean(
        requestedCursor &&
        result.nextCursor &&
        this.grantsCursorHistory.has(result.nextCursor),
      );
      const seen = new Set<string>();
      const items = [
        ...(loadMore ? latest.grants : []),
        ...result.items,
      ].filter((grant) => {
        if (seen.has(grant.profileId)) return false;
        seen.add(grant.profileId);
        return true;
      });
      this.publish({
        ...latest,
        grantsState: "ready",
        grants: items,
        grantsNextCursor: cursorCycle ? null : result.nextCursor,
        grantsFailure: cursorCycle ? "cursor_cycle" : null,
      });
    } catch (error) {
      if (!this.grantsCurrent(operation)) return;
      const latest = this.current(authorityKey, resourceId);
      if (!latest) return;
      const stale =
        error instanceof ApiRequestError &&
        (error.code === "RESOURCE_SHARES_CURSOR_STALE" ||
          error.code === "RESOURCE_SHARE_VISIBILITY_REQUIRED");
      if (stale) this.grantsCursorHistory.clear();
      const failure = stale ? null : resourceConsumptionFailure(error);
      this.publish({
        ...latest,
        grantsState: stale ? "idle" : loadMore ? "ready" : "error",
        grants: stale ? [] : latest.grants,
        grantsNextCursor: stale ? null : latest.grantsNextCursor,
        grantsFailure: failure,
        outcome: stale ? "visibility_changed" : latest.outcome,
      });
    } finally {
      if (this.grantsOperation === operation) this.grantsOperation = null;
    }
  }

  selectGrant(
    authorityKey: string,
    resourceId: string,
    profileId: string,
  ): boolean {
    const current = this.current(authorityKey, resourceId);
    if (
      !current ||
      current.busy ||
      current.grantsState !== "ready" ||
      current.outcome === "visibility_changed"
    )
      return false;
    const person = current.grants.find(
      (grant) => grant.profileId === profileId,
    );
    if (!person) return false;
    this.publish({
      ...current,
      selected: {
        profileId: person.profileId,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
      },
      outcome: null,
      failure: null,
    });
    return true;
  }

  async search(
    authorityKey: string,
    resourceId: string,
    rawQuery: string,
  ): Promise<void> {
    const current = this.current(authorityKey, resourceId);
    if (
      !current ||
      !current.canManageShares ||
      current.visibility !== "shared" ||
      current.outcome === "visibility_changed" ||
      current.busy
    )
      return;
    const query = rawQuery.trim().slice(0, RESOURCE_SHARE_PEOPLE_QUERY_MAX);
    this.abortSearch();
    if (!validSharePeopleQuery(query)) {
      this.publish({
        ...current,
        query,
        searchState: "idle",
        people: [],
        selected: null,
        outcome: null,
        failure: null,
      });
      return;
    }

    const operation = this.operation(authorityKey, resourceId);
    this.searchOperation = operation;
    this.publish({
      ...current,
      query,
      searchState: "loading",
      people: [],
      selected: null,
      outcome: null,
      failure: null,
    });

    try {
      const results = await this.api.searchPeople(
        query,
        operation.controller.signal,
      );
      if (!this.searchCurrent(operation)) return;
      const ready = this.current(authorityKey, resourceId);
      if (!ready) return;
      const seen = new Set<string>();
      const people = results.filter((person) => {
        if (
          !person.profileId ||
          person.profileId === ready.ownerProfileId ||
          seen.has(person.profileId)
        )
          return false;
        seen.add(person.profileId);
        return true;
      });
      this.publish({ ...ready, searchState: "ready", people, failure: null });
    } catch (error) {
      if (!this.searchCurrent(operation)) return;
      const ready = this.current(authorityKey, resourceId);
      if (ready) {
        this.publish({
          ...ready,
          searchState: "error",
          people: [],
          selected: null,
          failure: resourceConsumptionFailure(error),
        });
      }
    } finally {
      if (this.searchOperation === operation) this.searchOperation = null;
    }
  }

  clearSearch(authorityKey: string, resourceId: string): void {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy || current.outcome === "visibility_changed")
      return;
    this.abortSearch();
    this.publish({
      ...current,
      query: "",
      people: [],
      selected: null,
      searchState: "idle",
      outcome: null,
      failure: null,
    });
  }

  select(authorityKey: string, resourceId: string, profileId: string): boolean {
    const current = this.current(authorityKey, resourceId);
    if (!current || current.busy || current.searchState !== "ready")
      return false;
    const selected = current.people.find(
      (person) => person.profileId === profileId,
    );
    if (!selected) return false;
    this.publish({ ...current, selected, outcome: null, failure: null });
    return true;
  }

  async mutate(
    authorityKey: string,
    resourceId: string,
    action: ShareAction,
  ): Promise<boolean> {
    const current = this.current(authorityKey, resourceId);
    if (
      !current ||
      current.visibility !== "shared" ||
      !current.canManageShares ||
      current.outcome === "visibility_changed" ||
      current.outcome === "uncertain" ||
      !current.selected ||
      current.busy ||
      this.mutationOperation
    )
      return false;

    this.abortSearch();
    this.abortGrants();
    const operation = this.operation(authorityKey, resourceId);
    this.mutationOperation = operation;
    const person = current.selected;
    this.publish({
      ...current,
      busy: action,
      outcome: null,
      failure: null,
      grantsState:
        current.grantsState === "loading" ? "idle" : current.grantsState,
    });
    let writeStarted = false;

    try {
      // A stale screen may still say "shared" after a visibility change.
      // Re-read the authoritative resource before granting or revoking.
      const { resource } = await this.api.resource(
        resourceId,
        operation.controller.signal,
      );
      if (!this.mutationCurrent(operation)) return false;
      if (
        !resource.capabilities.manageShares ||
        resource.visibility !== "shared" ||
        resource.revision !== current.revision
      ) {
        this.abortMutation();
        const ready = this.current(authorityKey, resourceId);
        if (ready) {
          this.publish({
            ...ready,
            selected: null,
            people: [],
            searchState: "idle",
            grantsState: "idle",
            grants: [],
            grantsNextCursor: null,
            busy: null,
            outcome: "visibility_changed",
          });
        }
        return false;
      }

      if (action === "grant") {
        writeStarted = true;
        const result = await this.api.grant(
          resourceId,
          person.profileId,
          operation.controller.signal,
        );
        if (!this.mutationCurrent(operation)) return false;
        if (result.shared !== true) {
          this.finishMutation(operation, "uncertain", null);
          return false;
        }
      } else {
        writeStarted = true;
        await this.api.revoke(
          resourceId,
          person.profileId,
          operation.controller.signal,
        );
        if (!this.mutationCurrent(operation)) return false;
      }

      this.finishMutation(
        operation,
        action === "grant" ? "granted" : "revoked",
        null,
      );
      const latest = this.current(authorityKey, resourceId);
      if (latest) {
        this.publish({
          ...latest,
          grantsState: "idle",
          grants: [],
          grantsNextCursor: null,
          grantsFailure: null,
        });
      }
      return true;
    } catch (error) {
      if (this.mutationCurrent(operation)) {
        const failure = resourceConsumptionFailure(error);
        const ambiguous =
          writeStarted &&
          (failure === "offline" ||
            failure === "timeout" ||
            failure === "server_unavailable" ||
            failure === "error");
        this.finishMutation(
          operation,
          ambiguous ? "uncertain" : "error",
          failure,
        );
        if (ambiguous) {
          const latest = this.current(authorityKey, resourceId);
          if (latest) {
            this.publish({
              ...latest,
              grantsState: "idle",
              grants: [],
              grantsNextCursor: null,
            });
          }
        }
      }
      return false;
    }
  }

  suspend(authorityKey: string): void {
    const current = this.snapshot;
    if (current.kind !== "ready" || current.authorityKey !== authorityKey)
      return;
    this.abortAll();
    this.publish({
      ...current,
      busy: null,
      searchState:
        current.searchState === "loading" ? "idle" : current.searchState,
      grantsState:
        current.grantsState === "loading" ? "idle" : current.grantsState,
      outcome: current.busy ? "uncertain" : current.outcome,
    });
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey !== authorityKey
    )
      return;
    this.abortAll();
    this.grantsCursorHistory.clear();
    this.publish({ kind: "idle" });
  }

  private current(authorityKey: string, resourceId: string): Ready | null {
    const snapshot = this.snapshot;
    return snapshot.kind === "ready" &&
      snapshot.authorityKey === authorityKey &&
      snapshot.resourceId === resourceId
      ? snapshot
      : null;
  }

  private operation(authorityKey: string, resourceId: string): Operation {
    return {
      authorityKey,
      resourceId,
      generation: ++this.generation,
      controller: new AbortController(),
    };
  }

  private searchCurrent(operation: Operation): boolean {
    return (
      this.searchOperation === operation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private grantsCurrent(operation: Operation): boolean {
    return (
      this.grantsOperation === operation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private mutationCurrent(operation: Operation): boolean {
    return (
      this.mutationOperation === operation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private finishMutation(
    operation: Operation,
    outcome: ShareOutcome,
    failure: ResourceConsumptionFailure | null,
  ): void {
    const current = this.current(operation.authorityKey, operation.resourceId);
    if (current && this.mutationCurrent(operation)) {
      this.publish({ ...current, busy: null, outcome, failure });
    }
    if (this.mutationOperation === operation) this.mutationOperation = null;
  }

  private abortSearch(): void {
    this.searchOperation?.controller.abort();
    this.searchOperation = null;
  }

  private abortMutation(): void {
    this.mutationOperation?.controller.abort();
    this.mutationOperation = null;
  }

  private abortGrants(): void {
    this.grantsOperation?.controller.abort();
    this.grantsOperation = null;
  }

  private abortAll(): void {
    this.generation += 1;
    this.abortSearch();
    this.abortGrants();
    this.abortMutation();
  }

  private publish(snapshot: ResourceDirectSharingSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
