import type {
  ProfileActivity,
  PublicProfileResponse,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { MobileSearchApi } from "./search-api";

export type PublicProfileActivityFailure =
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "forbidden"
  | "not_found"
  | "restricted"
  | "error";

export type PublicProfileActivitiesSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      profileId: string;
      items: ProfileActivity[];
      nextCursor: string | null;
      limit: number;
      loadingMore: boolean;
      failure: PublicProfileActivityFailure | null;
    };

type Listener = (snapshot: PublicProfileActivitiesSnapshot) => void;
type PublicProfile = PublicProfileResponse["profile"];

type Operation = {
  authorityKey: string;
  profileId: string;
  generation: number;
  controller: AbortController;
};

function failureKind(error: unknown): PublicProfileActivityFailure {
  if (!(error instanceof ApiRequestError)) return "error";
  if (error.code === "ACCOUNT_RESTRICTED") return "restricted";
  if (error.kind === "offline") return "offline";
  if (error.kind === "timeout") return "timeout";
  if (error.kind === "server_unavailable") return "server_unavailable";
  if (error.kind === "forbidden") return "forbidden";
  if (error.status === 404 || error.kind === "gone") return "not_found";
  return "error";
}

function appendUniqueActivities(
  current: ProfileActivity[],
  next: ProfileActivity[],
): ProfileActivity[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

export class PublicProfileActivitiesController {
  private snapshot: PublicProfileActivitiesSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private readonly requestedCursors = new Set<string>();
  private active: Operation | null = null;
  private profile: PublicProfile | null = null;
  private authorityKey: string | null = null;

  constructor(
    private readonly api: Pick<MobileSearchApi, "publicProfileActivities">,
  ) {}

  getSnapshot = (): PublicProfileActivitiesSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setProfile(authorityKey: string, profile: PublicProfile): void {
    if (
      this.authorityKey === authorityKey &&
      this.profile === profile &&
      this.snapshot.kind === "ready"
    ) {
      return;
    }

    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    this.requestedCursors.clear();
    this.authorityKey = authorityKey;
    this.profile = profile;
    this.publish({
      kind: "ready",
      authorityKey,
      profileId: profile.id,
      items: [...(profile.activities ?? [])],
      nextCursor: profile.activitiesNextCursor ?? null,
      limit: profile.activitiesLimit ?? 20,
      loadingMore: false,
      failure: null,
    });
  }

  async loadMore(authorityKey: string, profileId: string): Promise<void> {
    const current = this.snapshot;
    if (
      current.kind !== "ready" ||
      current.authorityKey !== authorityKey ||
      current.profileId !== profileId ||
      current.loadingMore ||
      !current.nextCursor ||
      this.active
    ) {
      return;
    }

    if (this.requestedCursors.has(current.nextCursor)) {
      this.publish({
        ...current,
        nextCursor: null,
        failure: "server_unavailable",
      });
      return;
    }

    const requestedCursor = current.nextCursor;
    const operation: Operation = {
      authorityKey,
      profileId,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const page = await this.api.publicProfileActivities(
        profileId,
        requestedCursor,
        current.limit,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.snapshot;
      if (latest.kind !== "ready") return;
      const cycleDetected =
        page.nextCursor !== null &&
        (page.nextCursor === requestedCursor ||
          this.requestedCursors.has(page.nextCursor));
      this.requestedCursors.add(requestedCursor);
      this.publish({
        ...latest,
        items: appendUniqueActivities(latest.items, page.items),
        nextCursor: cycleDetected ? null : page.nextCursor,
        loadingMore: false,
        failure: cycleDetected ? "server_unavailable" : null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.snapshot;
      if (latest.kind === "ready") {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: failureKind(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    this.authorityKey = null;
    this.profile = null;
    this.requestedCursors.clear();
    this.publish({ kind: "idle" });
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      this.authorityKey === operation.authorityKey &&
      this.snapshot.kind === "ready" &&
      this.snapshot.profileId === operation.profileId &&
      this.snapshot.authorityKey === operation.authorityKey
    );
  }

  private finish(operation: Operation): void {
    if (this.active === operation) this.active = null;
  }

  private publish(snapshot: PublicProfileActivitiesSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
