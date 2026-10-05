import type {
  OrganizationDetail,
  OrganizationEvent,
  OrganizationPost,
  OrganizationSearchPage,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type {
  MobileOrganizationsApiContract,
  OrganizationDirectoryInput,
} from "./organizations-api";

export type MobileOrganizationsFailureKind =
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "restricted"
  | "auth_required"
  | "not_found"
  | "error";

export type MobileOrganizationsFailure = {
  kind: MobileOrganizationsFailureKind;
  code: string | null;
};

export function mobileOrganizationsFailure(
  error: unknown,
): MobileOrganizationsFailure {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "error", code: null };
  }
  if (error.code === "ACCOUNT_RESTRICTED") {
    return { kind: "restricted", code: error.code };
  }
  if (error.kind === "offline") return { kind: "offline", code: error.code };
  if (error.kind === "timeout") return { kind: "timeout", code: error.code };
  if (error.kind === "server_unavailable") {
    return { kind: "server_unavailable", code: error.code };
  }
  if (error.kind === "unauthorized") {
    return { kind: "auth_required", code: error.code };
  }
  if (error.kind === "forbidden") {
    return { kind: "restricted", code: error.code };
  }
  if (error.status === 404 || error.kind === "gone") {
    return { kind: "not_found", code: error.code };
  }
  return { kind: "error", code: error.code };
}

function ambiguousFailure(failure: MobileOrganizationsFailure): boolean {
  return (
    failure.kind === "offline" ||
    failure.kind === "timeout" ||
    failure.kind === "server_unavailable"
  );
}

function appendUnique<T extends { id: string }>(current: T[], next: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

type Operation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
};

export type MobileOrganizationsDirectorySnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      page: OrganizationSearchPage;
      loadingMore: boolean;
      failure: MobileOrganizationsFailure | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      failure: MobileOrganizationsFailure;
    };

type DirectoryListener = (
  snapshot: MobileOrganizationsDirectorySnapshot,
) => void;

export class MobileOrganizationsDirectoryController {
  private snapshot: MobileOrganizationsDirectorySnapshot = { kind: "idle" };
  private listeners = new Set<DirectoryListener>();
  private authorityKey: string | null = null;
  private input: OrganizationDirectoryInput = {};
  private generation = 0;
  private active: Operation | null = null;

  constructor(private readonly api: MobileOrganizationsApiContract) {}

  getSnapshot(): MobileOrganizationsDirectorySnapshot {
    return this.snapshot;
  }

  subscribe(listener: DirectoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(
    authorityKey: string,
    input: OrganizationDirectoryInput,
  ): Promise<void> {
    this.input = {
      ...(input.q ? { q: input.q } : {}),
      ...(input.type ? { type: input.type } : {}),
    };
    const operation = this.begin(authorityKey);
    this.publish({ kind: "loading", authorityKey });

    try {
      const page = await this.api.search(
        this.input,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        page,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        failure: mobileOrganizationsFailure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (
      !current ||
      current.loadingMore ||
      !current.page.nextCursor ||
      this.active
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const page = await this.api.search(
        { ...this.input, cursor: current.page.nextCursor },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;

      this.publish({
        ...latest,
        page: {
          items: appendUnique(latest.page.items, page.items),
          nextCursor: page.nextCursor,
        },
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: mobileOrganizationsFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  suspend(authorityKey: string): void {
    if (authorityKey !== this.authorityKey) return;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    const current = this.currentReady(authorityKey);
    if (current) this.publish({ ...current, loadingMore: false });
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;
    this.authorityKey = null;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string): Operation {
    this.authorityKey = authorityKey;
    this.generation += 1;
    this.active?.controller.abort();
    const operation = {
      authorityKey,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    return operation;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.active === operation &&
      this.authorityKey === operation.authorityKey &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted
    );
  }

  private finish(operation: Operation): void {
    if (this.active === operation) this.active = null;
  }

  private currentReady(
    authorityKey: string,
  ): Extract<MobileOrganizationsDirectorySnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private publish(snapshot: MobileOrganizationsDirectorySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

export type MobileOrganizationDetailSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string; organizationId: string }
  | {
      kind: "ready";
      authorityKey: string;
      organizationId: string;
      organization: OrganizationDetail;
      busy: "follow" | "posts-more" | "events-more" | null;
      failure: MobileOrganizationsFailure | null;
      notice: string | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      organizationId: string;
      failure: MobileOrganizationsFailure;
    };

type DetailListener = (snapshot: MobileOrganizationDetailSnapshot) => void;

export class MobileOrganizationDetailController {
  private snapshot: MobileOrganizationDetailSnapshot = { kind: "idle" };
  private listeners = new Set<DetailListener>();
  private authorityKey: string | null = null;
  private organizationId: string | null = null;
  private generation = 0;
  private active: Operation | null = null;

  constructor(private readonly api: MobileOrganizationsApiContract) {}

  getSnapshot(): MobileOrganizationDetailSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DetailListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string, organizationId: string): Promise<void> {
    this.organizationId = organizationId;
    const operation = this.begin(authorityKey);
    this.publish({ kind: "loading", authorityKey, organizationId });

    try {
      const response = await this.api.get(
        organizationId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation, organizationId)) return;
      this.publishReady(
        authorityKey,
        organizationId,
        response.organization,
        null,
      );
    } catch (error) {
      if (!this.isCurrent(operation, organizationId)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        organizationId,
        failure: mobileOrganizationsFailure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  async toggleFollow(
    authorityKey: string,
    organizationId: string,
  ): Promise<void> {
    const current = this.currentReady(authorityKey, organizationId);
    if (!current || current.busy || this.active) return;

    const operation = this.begin(authorityKey);
    this.publish({ ...current, busy: "follow", failure: null, notice: null });

    const wasFollowing = current.organization.viewer?.following === true;

    try {
      if (wasFollowing) {
        await this.api.unfollow(organizationId, operation.controller.signal);
      } else {
        await this.api.follow(organizationId, operation.controller.signal);
      }
      if (!this.isCurrent(operation, organizationId)) return;

      const refreshed = await this.api.get(
        organizationId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation, organizationId)) return;
      this.publishReady(
        authorityKey,
        organizationId,
        refreshed.organization,
        wasFollowing
          ? "Dejaste de seguir esta organización."
          : "Ahora seguís esta organización.",
      );
    } catch (error) {
      if (!this.isCurrent(operation, organizationId)) return;
      const failure = mobileOrganizationsFailure(error);

      if (ambiguousFailure(failure)) {
        try {
          const refreshed = await this.api.get(
            organizationId,
            operation.controller.signal,
          );
          if (!this.isCurrent(operation, organizationId)) return;
          this.publishReady(
            authorityKey,
            organizationId,
            refreshed.organization,
            "La conexión se interrumpió. Recargamos el estado confirmado por el servidor; revisalo antes de repetir la acción.",
          );
          return;
        } catch (refreshError) {
          if (!this.isCurrent(operation, organizationId)) return;
          this.publishFailureOnReady(
            authorityKey,
            organizationId,
            mobileOrganizationsFailure(refreshError),
          );
          return;
        }
      }

      this.publishFailureOnReady(authorityKey, organizationId, failure);
    } finally {
      this.finish(operation);
    }
  }

  async loadMorePosts(
    authorityKey: string,
    organizationId: string,
  ): Promise<void> {
    const current = this.currentReady(authorityKey, organizationId);
    if (
      !current ||
      current.busy ||
      !current.organization.postsNextCursor ||
      this.active
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    this.publish({
      ...current,
      busy: "posts-more",
      failure: null,
      notice: null,
    });

    try {
      const page = await this.api.posts(
        organizationId,
        current.organization.postsNextCursor,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation, organizationId)) return;
      const latest = this.currentReady(authorityKey, organizationId);
      if (!latest) return;

      this.publish({
        ...latest,
        organization: {
          ...latest.organization,
          posts: appendUnique<OrganizationPost>(
            latest.organization.posts,
            page.items,
          ),
          postsNextCursor: page.nextCursor,
        },
        busy: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation, organizationId)) return;
      this.publishFailureOnReady(
        authorityKey,
        organizationId,
        mobileOrganizationsFailure(error),
      );
    } finally {
      this.finish(operation);
    }
  }

  async loadMoreEvents(
    authorityKey: string,
    organizationId: string,
  ): Promise<void> {
    const current = this.currentReady(authorityKey, organizationId);
    if (
      !current ||
      current.busy ||
      !current.organization.eventsNextCursor ||
      this.active
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    this.publish({
      ...current,
      busy: "events-more",
      failure: null,
      notice: null,
    });

    try {
      const page = await this.api.events(
        organizationId,
        current.organization.eventsNextCursor,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation, organizationId)) return;
      const latest = this.currentReady(authorityKey, organizationId);
      if (!latest) return;

      this.publish({
        ...latest,
        organization: {
          ...latest.organization,
          events: appendUnique<OrganizationEvent>(
            latest.organization.events,
            page.items,
          ),
          eventsNextCursor: page.nextCursor,
        },
        busy: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation, organizationId)) return;
      this.publishFailureOnReady(
        authorityKey,
        organizationId,
        mobileOrganizationsFailure(error),
      );
    } finally {
      this.finish(operation);
    }
  }

  suspend(authorityKey: string): void {
    if (authorityKey !== this.authorityKey) return;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;

    if (
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
    ) {
      this.publish({ ...this.snapshot, busy: null });
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;
    this.authorityKey = null;
    this.organizationId = null;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string): Operation {
    this.authorityKey = authorityKey;
    this.generation += 1;
    this.active?.controller.abort();
    const operation = {
      authorityKey,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    return operation;
  }

  private isCurrent(operation: Operation, organizationId: string): boolean {
    return (
      this.active === operation &&
      this.authorityKey === operation.authorityKey &&
      this.organizationId === organizationId &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted
    );
  }

  private currentReady(
    authorityKey: string,
    organizationId: string,
  ): Extract<MobileOrganizationDetailSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.organizationId === organizationId
      ? this.snapshot
      : null;
  }

  private publishReady(
    authorityKey: string,
    organizationId: string,
    organization: OrganizationDetail,
    notice: string | null,
  ): void {
    this.publish({
      kind: "ready",
      authorityKey,
      organizationId,
      organization,
      busy: null,
      failure: null,
      notice,
    });
  }

  private publishFailureOnReady(
    authorityKey: string,
    organizationId: string,
    failure: MobileOrganizationsFailure,
  ): void {
    const current = this.currentReady(authorityKey, organizationId);
    if (!current) return;
    this.publish({ ...current, busy: null, failure, notice: null });
  }

  private finish(operation: Operation): void {
    if (this.active === operation) this.active = null;
  }

  private publish(snapshot: MobileOrganizationDetailSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
