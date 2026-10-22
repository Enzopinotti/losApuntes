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

export type MobileOrganizationsDirectoryFollowAction = {
  organizationId: string;
  status: "loading" | "success" | "failure";
  message: string | null;
  failure: MobileOrganizationsFailure | null;
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

function followFailureMessage(failure: MobileOrganizationsFailure): string {
  if (failure.kind === "offline") {
    return "Sin conexión: no pudimos confirmar el cambio. Revisá el estado antes de repetirlo.";
  }
  if (failure.kind === "timeout") {
    return "La solicitud venció y no pudimos confirmar el cambio. Revisá el estado antes de repetirlo.";
  }
  if (failure.kind === "server_unavailable") {
    return "El servidor no pudo confirmar el cambio. Revisá el estado antes de repetirlo.";
  }
  if (failure.kind === "auth_required") {
    return "La sesión cambió. Iniciá sesión nuevamente.";
  }
  if (failure.kind === "restricted") {
    return "Esta cuenta no puede seguir organizaciones.";
  }
  if (failure.kind === "not_found") {
    return "Esta organización ya no está disponible.";
  }
  return "No pudimos cambiar el seguimiento de esta organización.";
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
      followAction: MobileOrganizationsDirectoryFollowAction | null;
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
      ...(input.verificationState
        ? { verificationState: input.verificationState }
        : {}),
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
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
        followAction: null,
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

  async toggleFollow(
    authorityKey: string,
    organizationId: string,
  ): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (!current || this.active || current.followAction?.status === "loading") {
      return;
    }
    const organization = current.page.items.find(
      (item) => item.id === organizationId,
    );
    if (!organization) return;

    const desiredFollowing = organization.viewer?.following !== true;
    const operation = this.begin(authorityKey);
    this.publish({
      ...current,
      followAction: {
        organizationId,
        status: "loading",
        message: null,
        failure: null,
      },
    });

    try {
      const result = desiredFollowing
        ? await this.api.follow(organizationId, operation.controller.signal)
        : await this.api.unfollow(organizationId, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        page: this.withFollowing(latest.page, organizationId, result.following),
        followAction: {
          organizationId,
          status: "success",
          message: result.following
            ? `Ahora seguís ${organization.name}.`
            : `Dejaste de seguir ${organization.name}.`,
          failure: null,
        },
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const failure = mobileOrganizationsFailure(error);

      if (ambiguousFailure(failure)) {
        try {
          const refreshed = await this.api.get(
            organizationId,
            operation.controller.signal,
          );
          if (!this.isCurrent(operation)) return;
          const latest = this.currentReady(authorityKey);
          if (!latest) return;
          const confirmedFollowing = refreshed.organization.viewer?.following;
          if (confirmedFollowing === undefined) {
            this.publish({
              ...latest,
              followAction: {
                organizationId,
                status: "failure",
                message:
                  "No pudimos leer el estado confirmado. Revisá la organización antes de repetir la acción.",
                failure,
              },
            });
            return;
          }

          const confirmed = confirmedFollowing === desiredFollowing;
          this.publish({
            ...latest,
            page: this.withFollowing(
              latest.page,
              organizationId,
              confirmedFollowing,
            ),
            followAction: {
              organizationId,
              status: confirmed ? "success" : "failure",
              message: confirmed
                ? `La conexión se interrumpió; el servidor confirma que ${confirmedFollowing ? "ahora seguís" : "dejaste de seguir"} ${organization.name}.`
                : confirmedFollowing
                  ? `El servidor confirma que todavía seguís ${organization.name}.`
                  : `El servidor confirma que todavía no seguís ${organization.name}.`,
              failure: confirmed ? null : failure,
            },
          });
        } catch (refreshError) {
          if (!this.isCurrent(operation)) return;
          const latest = this.currentReady(authorityKey);
          if (!latest) return;
          const refreshFailure = mobileOrganizationsFailure(refreshError);
          this.publish({
            ...latest,
            followAction: {
              organizationId,
              status: "failure",
              message: followFailureMessage(refreshFailure),
              failure: refreshFailure,
            },
          });
        }
        return;
      }

      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        followAction: {
          organizationId,
          status: "failure",
          message: followFailureMessage(failure),
          failure,
        },
      });
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
    if (current) {
      this.publish({
        ...current,
        loadingMore: false,
        followAction:
          current.followAction?.status === "loading"
            ? null
            : current.followAction,
      });
    }
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

  private withFollowing(
    page: OrganizationSearchPage,
    organizationId: string,
    following: boolean,
  ): OrganizationSearchPage {
    return {
      ...page,
      items: page.items.map((item) =>
        item.id === organizationId
          ? { ...item, viewer: { ...item.viewer, following } }
          : item,
      ),
    };
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
      eventView: "all" | "upcoming";
      upcomingEvents: OrganizationEvent[];
      upcomingEventsNextCursor: string | null;
      busy: "follow" | "posts-more" | "events-filter" | "events-more" | null;
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
    const cursor =
      current?.eventView === "upcoming"
        ? current.upcomingEventsNextCursor
        : current?.organization.eventsNextCursor;
    if (!current || current.busy || !cursor || this.active) {
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
        cursor,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation, organizationId)) return;
      const latest = this.currentReady(authorityKey, organizationId);
      if (!latest) return;

      this.publish(
        latest.eventView === "upcoming"
          ? {
              ...latest,
              upcomingEvents: appendUnique<OrganizationEvent>(
                latest.upcomingEvents,
                page.items,
              ),
              upcomingEventsNextCursor: page.nextCursor,
              busy: null,
            }
          : {
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
            },
      );
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

  async loadUpcomingEvents(
    authorityKey: string,
    organizationId: string,
  ): Promise<void> {
    const current = this.currentReady(authorityKey, organizationId);
    if (!current || current.busy || this.active) return;

    const operation = this.begin(authorityKey);
    this.publish({
      ...current,
      busy: "events-filter",
      failure: null,
      notice: null,
    });

    try {
      const page = await this.api.events(
        organizationId,
        undefined,
        operation.controller.signal,
        new Date().toISOString(),
      );
      if (!this.isCurrent(operation, organizationId)) return;
      const latest = this.currentReady(authorityKey, organizationId);
      if (!latest) return;

      this.publish({
        ...latest,
        eventView: "upcoming",
        upcomingEvents: page.items,
        upcomingEventsNextCursor: page.nextCursor,
        busy: null,
        failure: null,
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

  showAllEvents(authorityKey: string, organizationId: string): void {
    const current = this.currentReady(authorityKey, organizationId);
    if (!current || current.busy) return;
    this.publish({ ...current, eventView: "all", failure: null, notice: null });
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
      eventView: "all",
      upcomingEvents: [],
      upcomingEventsNextCursor: null,
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
