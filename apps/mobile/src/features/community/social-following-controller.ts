import type { FollowingItem } from "@losapuntes/contracts/social-qa";

import {
  communityFailure,
  type CommunityFailure,
} from "./community-controller";
import type { SocialFollowingApi } from "./community-api";
import { repeatsSocialCursor } from "./social-pagination";

export const SOCIAL_FOLLOWING_PAGE_SIZE = 25;

export type SocialFollowingSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "failure";
      authorityKey: string;
      failure: CommunityFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      items: FollowingItem[];
      nextCursor: string | null;
      refreshing: boolean;
      loadingMore: boolean;
      busyProfileId: string | null;
      failure: CommunityFailure | null;
      notice: string | null;
    };

type Operation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
};

type Listener = (snapshot: SocialFollowingSnapshot) => void;

function appendUnique(
  current: FollowingItem[],
  next: FollowingItem[],
): FollowingItem[] {
  const byProfileId = new Map(
    current.map((item) => [item.profile.profileId, item]),
  );
  for (const item of next) byProfileId.set(item.profile.profileId, item);
  return [...byProfileId.values()];
}

export class SocialFollowingController {
  private authorityKey: string | null = null;
  private generation = 0;
  private operation: Operation | null = null;
  private snapshot: SocialFollowingSnapshot = { kind: "idle" };
  private readonly requestedCursors = new Set<string>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly api: SocialFollowingApi) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SocialFollowingSnapshot {
    return this.snapshot;
  }

  setAuthority(authorityKey: string | null): void {
    if (this.authorityKey === authorityKey) return;
    this.cancelOperation();
    this.generation += 1;
    this.authorityKey = authorityKey;
    this.requestedCursors.clear();
    this.publish({ kind: "idle" });
  }

  async load(authorityKey: string): Promise<void> {
    if (!this.isAuthorityCurrent(authorityKey) || this.operation) return;
    const current = this.ready(authorityKey);
    const operation = this.begin(authorityKey);
    if (!operation) return;
    this.publish(
      current
        ? { ...current, refreshing: true, failure: null, notice: null }
        : { kind: "loading", authorityKey },
    );

    try {
      const page = await this.api.following(
        { limit: SOCIAL_FOLLOWING_PAGE_SIZE },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      this.requestedCursors.clear();
      this.publish({
        kind: "ready",
        authorityKey,
        items: page.items,
        nextCursor: page.nextCursor,
        refreshing: false,
        loadingMore: false,
        busyProfileId: null,
        failure: null,
        notice: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      const failure = communityFailure(error);
      this.publish(
        latest
          ? { ...latest, refreshing: false, failure }
          : { kind: "failure", authorityKey, failure },
      );
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    if (
      !current ||
      current.refreshing ||
      current.loadingMore ||
      current.busyProfileId ||
      this.operation
    ) {
      return;
    }
    const cursor = current.nextCursor;
    if (!cursor) return;
    if (this.requestedCursors.has(cursor)) {
      this.publish({
        ...current,
        nextCursor: null,
        failure: {
          kind: "server_unavailable",
          code: "SOCIAL_FOLLOWING_CURSOR_REPEATED",
        },
      });
      return;
    }

    const operation = this.begin(authorityKey);
    if (!operation) return;
    this.publish({
      ...current,
      loadingMore: true,
      failure: null,
      notice: null,
    });
    try {
      const page = await this.api.following(
        { limit: SOCIAL_FOLLOWING_PAGE_SIZE, cursor },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      const repeatedCursor = repeatsSocialCursor(
        this.requestedCursors,
        cursor,
        page.nextCursor,
      );
      this.requestedCursors.add(cursor);
      this.publish({
        ...latest,
        items: appendUnique(latest.items, page.items),
        nextCursor: repeatedCursor ? null : page.nextCursor,
        loadingMore: false,
        failure: repeatedCursor
          ? {
              kind: "server_unavailable",
              code: "SOCIAL_FOLLOWING_CURSOR_REPEATED",
            }
          : null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: communityFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  async unfollow(authorityKey: string, profileId: string): Promise<void> {
    const current = this.ready(authorityKey);
    const target = current?.items.find(
      (item) => item.profile.profileId === profileId,
    );
    if (
      !current ||
      !target ||
      current.refreshing ||
      current.loadingMore ||
      current.busyProfileId ||
      this.operation
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    if (!operation) return;
    this.publish({
      ...current,
      busyProfileId: profileId,
      failure: null,
      notice: null,
    });

    try {
      await this.api.unfollowProfile(profileId, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        items: latest.items.filter(
          (item) => item.profile.profileId !== profileId,
        ),
        busyProfileId: null,
        failure: null,
        notice: `Dejaste de seguir a ${target.profile.displayName}.`,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          busyProfileId: null,
          failure: communityFailure(error),
          notice: null,
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.cancelOperation();
    this.generation += 1;
    this.authorityKey = null;
    this.requestedCursors.clear();
    this.publish({ kind: "idle" });
  }

  private ready(
    authorityKey: string,
  ): Extract<SocialFollowingSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private begin(authorityKey: string): Operation | null {
    if (this.authorityKey !== authorityKey || this.operation) return null;
    const operation: Operation = {
      authorityKey,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.operation = operation;
    return operation;
  }

  private finish(operation: Operation): void {
    if (this.operation === operation) this.operation = null;
  }

  private cancelOperation(): void {
    this.operation?.controller.abort();
    this.operation = null;
  }

  private isAuthorityCurrent(authorityKey: string): boolean {
    return this.authorityKey === authorityKey;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.operation === operation &&
      this.generation === operation.generation &&
      this.authorityKey === operation.authorityKey
    );
  }

  private publish(snapshot: SocialFollowingSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
