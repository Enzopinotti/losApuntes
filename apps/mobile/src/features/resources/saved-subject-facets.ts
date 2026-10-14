import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";
import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";

export type SavedSubjectFacet = {
  subjectId: string;
  name: string;
  count: number;
};
export type SavedSubjectFacetsPage = {
  items: SavedSubjectFacet[];
  truncated: boolean;
};
export type SavedSubjectFacetsSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | { kind: "ready"; authorityKey: string; data: SavedSubjectFacetsPage; refreshing?: boolean; refreshFailure?: ResourceConsumptionFailure | null }
  | { kind: "failure"; authorityKey: string; reason: ResourceConsumptionFailure };

export interface SavedSubjectFacetsApi {
  subjects(signal?: AbortSignal): Promise<SavedSubjectFacetsPage>;
}

/** Session-fenced authenticated global facets; no local storage or caching. */
export class MobileSavedSubjectFacetsApi implements SavedSubjectFacetsApi {
  constructor(
    private readonly session: SessionController,
    private readonly client: MobileApiClient,
  ) {}

  async subjects(signal?: AbortSignal): Promise<SavedSubjectFacetsPage> {
    const authority = this.session.getCredentialSnapshot();
    if (!authority) {
      throw new ApiRequestError("unauthorized", 401, "AUTHENTICATION_REQUIRED", "Authentication required");
    }
    try {
      const data = await this.client.request<SavedSubjectFacetsPage>(
        "/resources/saved/subjects",
        {
          credential: authority.credential,
          ...(signal ? { signal } : {}),
        },
      );
      if (!this.session.isCredentialAuthoritative(authority.credential, authority.generation)) {
        throw new ApiRequestError("unauthorized", null, "STALE_SESSION_AUTHORITY", "Session changed during saved facet load");
      }
      return data;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.kind === "unauthorized") {
          await this.session.invalidateIfAuthoritative(authority.credential, authority.generation);
        } else if (error.code === "ACCOUNT_RESTRICTED") {
          await this.session.restrictIfAuthoritative(authority.credential, authority.generation);
        }
      }
      throw error;
    }
  }
}

type Listener = (snapshot: SavedSubjectFacetsSnapshot) => void;

export class MobileSavedSubjectFacetsController {
  private snapshot: SavedSubjectFacetsSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: AbortController | null = null;

  constructor(private readonly api: SavedSubjectFacetsApi) {}

  getSnapshot() { return this.snapshot; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async load(authorityKey: string): Promise<void> {
    this.active?.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.active = controller;
    this.publish({ kind: "loading", authorityKey });
    try {
      const data = await this.api.subjects(controller.signal);
      if (!this.isCurrent(generation, controller, authorityKey)) return;
      this.publish({ kind: "ready", authorityKey, data });
    } catch (error) {
      if (!this.isCurrent(generation, controller, authorityKey)) return;
      this.publish({ kind: "failure", authorityKey, reason: resourceConsumptionFailure(error) });
    } finally {
      if (this.active === controller) this.active = null;
    }
  }

  /**
   * Refresh global Subject counts without replacing the chip selector with a
   * spinner. Failed checks retain the previous counts and visibly disclose
   * that they could be stale.
   */
  async sync(authorityKey: string): Promise<void> {
    if (
      this.snapshot.kind !== "ready" ||
      this.snapshot.authorityKey !== authorityKey ||
      this.active
    ) return;
    const controller = new AbortController();
    const generation = ++this.generation;
    this.active = controller;
    this.publish({ ...this.snapshot, refreshing: true, refreshFailure: null });
    try {
      const data = await this.api.subjects(controller.signal);
      if (!this.isCurrent(generation, controller, authorityKey)) return;
      this.publish({ kind: "ready", authorityKey, data, refreshing: false, refreshFailure: null });
    } catch (error) {
      if (!this.isCurrent(generation, controller, authorityKey)) return;
      const current = this.snapshot;
      if (current.kind === "ready") {
        this.publish({
          ...current,
          refreshing: false,
          refreshFailure: resourceConsumptionFailure(error),
        });
      }
    } finally {
      if (this.active === controller) this.active = null;
    }
  }

  invalidate(authorityKey?: string) {
    if (authorityKey && this.snapshot.kind !== "idle" && this.snapshot.authorityKey !== authorityKey) return;
    ++this.generation;
    this.active?.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  private isCurrent(generation: number, controller: AbortController, key: string) {
    return generation === this.generation && this.active === controller &&
      !controller.signal.aborted &&
      this.snapshot.kind !== "idle" && this.snapshot.authorityKey === key;
  }

  private publish(snapshot: SavedSubjectFacetsSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
