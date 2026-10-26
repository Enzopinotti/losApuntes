import type { ConnectionView } from "@losapuntes/contracts/social-qa";

import {
  communityFailure,
  isAmbiguousCommunityMutationFailure,
  type CommunityFailure,
} from "./community-controller";
import type { SocialConnectionsApi } from "./community-api";
import { repeatsSocialCursor } from "./social-pagination";

const CONNECTIONS_PAGE_SIZE = 25;
const RECONCILIATION_PAGE_SIZE = 100;

export type ConnectionList = "pending" | "accepted";
export type ConnectionResponseAction = "accept" | "decline";
export type ConnectionMutation = ConnectionResponseAction | "disconnect";

export type SocialConnectionsSnapshot =
  | { kind: "idle"; authorityKey: null }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "failure";
      authorityKey: string;
      failure: CommunityFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      pending: ConnectionView[];
      pendingNextCursor: string | null;
      accepted: ConnectionView[];
      acceptedNextCursor: string | null;
      refreshing: boolean;
      loadingMore: ConnectionList | null;
      busyConnectionId: string | null;
      failure: CommunityFailure | null;
      notice: string | null;
      targetConnectionId: string | null;
      reconciliationRequiredConnectionId: string | null;
    };

type Operation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
};

type Listener = (snapshot: SocialConnectionsSnapshot) => void;

function appendUnique(
  current: ConnectionView[],
  next: ConnectionView[],
): ConnectionView[] {
  const byId = new Map(
    current.map((connection) => [connection.id, connection]),
  );
  for (const connection of next) byId.set(connection.id, connection);
  return [...byId.values()];
}

function expectedStatus(action: ConnectionMutation): ConnectionView["status"] {
  if (action === "accept") return "accepted";
  if (action === "decline") return "declined";
  return "disconnected";
}

function confirmationCopy(
  connection: ConnectionView,
  action: ConnectionMutation,
): string {
  if (action === "accept") {
    return `Aceptaste la solicitud de ${connection.other.displayName}.`;
  }
  if (action === "decline") {
    return `Rechazaste la solicitud de ${connection.other.displayName}.`;
  }
  return `Desconectaste a ${connection.other.displayName}.`;
}

export class SocialConnectionsController {
  private authorityKey: string | null = null;
  private generation = 0;
  private operation: Operation | null = null;
  private snapshot: SocialConnectionsSnapshot = {
    kind: "idle",
    authorityKey: null,
  };
  private readonly requestedPendingCursors = new Set<string>();
  private readonly requestedAcceptedCursors = new Set<string>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly api: SocialConnectionsApi) {}

  setAuthority(authorityKey: string | null): void {
    if (this.authorityKey === authorityKey) return;
    this.cancelOperation();
    this.authorityKey = authorityKey;
    this.generation += 1;
    this.requestedPendingCursors.clear();
    this.requestedAcceptedCursors.clear();
    this.publish({ kind: "idle", authorityKey: null });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SocialConnectionsSnapshot {
    return this.snapshot;
  }

  async load(
    authorityKey: string,
    targetConnectionId: string | null,
  ): Promise<void> {
    if (!this.isAuthorityCurrent(authorityKey) || this.operation) return;
    const current = this.ready(authorityKey);
    const operation = this.begin(authorityKey);
    if (!operation) return;
    const targetId = targetConnectionId ?? current?.targetConnectionId ?? null;
    if (current) {
      this.publish({
        ...current,
        refreshing: true,
        failure: null,
        targetConnectionId: targetId,
      });
    } else {
      this.publish({ kind: "loading", authorityKey });
    }

    try {
      const [pendingPage, acceptedPage] = await Promise.all([
        this.api.connections(
          { status: "pending", limit: CONNECTIONS_PAGE_SIZE },
          operation.controller.signal,
        ),
        this.api.connections(
          { status: "accepted", limit: CONNECTIONS_PAGE_SIZE },
          operation.controller.signal,
        ),
      ]);
      if (!this.isCurrent(operation)) return;

      let ready: Extract<SocialConnectionsSnapshot, { kind: "ready" }> = {
        kind: "ready",
        authorityKey,
        pending: pendingPage.items,
        pendingNextCursor: pendingPage.nextCursor,
        accepted: acceptedPage.items,
        acceptedNextCursor: acceptedPage.nextCursor,
        refreshing: false,
        loadingMore: null,
        busyConnectionId: null,
        failure: null,
        notice: null,
        targetConnectionId: targetId,
        reconciliationRequiredConnectionId:
          current?.reconciliationRequiredConnectionId ?? null,
      };

      const reconciliationId =
        ready.reconciliationRequiredConnectionId ?? targetId;
      if (reconciliationId) {
        const allPage = await this.api.connections(
          { limit: RECONCILIATION_PAGE_SIZE },
          operation.controller.signal,
        );
        if (!this.isCurrent(operation)) return;
        const observed = allPage.items.find(
          (connection) => connection.id === reconciliationId,
        );
        if (observed) {
          ready = this.withCanonicalConnection(ready, observed);
          if (ready.reconciliationRequiredConnectionId === reconciliationId) {
            ready = {
              ...ready,
              reconciliationRequiredConnectionId: null,
            };
          }
        }
      }
      this.requestedPendingCursors.clear();
      this.requestedAcceptedCursors.clear();
      this.publish(ready);
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const failure = communityFailure(error);
      const latest = this.ready(authorityKey);
      this.publish(
        latest
          ? { ...latest, refreshing: false, loadingMore: null, failure }
          : { kind: "failure", authorityKey, failure },
      );
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string, list: ConnectionList): Promise<void> {
    const current = this.ready(authorityKey);
    if (
      !current ||
      current.refreshing ||
      current.loadingMore ||
      this.operation
    ) {
      return;
    }
    const cursor =
      list === "pending"
        ? current.pendingNextCursor
        : current.acceptedNextCursor;
    if (!cursor) return;
    const requestedCursors =
      list === "pending"
        ? this.requestedPendingCursors
        : this.requestedAcceptedCursors;
    if (requestedCursors.has(cursor)) {
      this.publish(
        list === "pending"
          ? {
              ...current,
              pendingNextCursor: null,
              failure: {
                kind: "server_unavailable",
                code: "SOCIAL_CONNECTIONS_CURSOR_REPEATED",
              },
            }
          : {
              ...current,
              acceptedNextCursor: null,
              failure: {
                kind: "server_unavailable",
                code: "SOCIAL_CONNECTIONS_CURSOR_REPEATED",
              },
            },
      );
      return;
    }

    const operation = this.begin(authorityKey);
    if (!operation) return;
    this.publish({
      ...current,
      loadingMore: list,
      failure: null,
      notice: null,
    });
    try {
      const page = await this.api.connections(
        { status: list, limit: CONNECTIONS_PAGE_SIZE, cursor },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      const repeatedCursor = repeatsSocialCursor(
        requestedCursors,
        cursor,
        page.nextCursor,
      );
      requestedCursors.add(cursor);
      let ready: Extract<SocialConnectionsSnapshot, { kind: "ready" }> =
        list === "pending"
          ? {
              ...latest,
              pending: appendUnique(latest.pending, page.items),
              pendingNextCursor: repeatedCursor ? null : page.nextCursor,
              loadingMore: null,
              failure: repeatedCursor
                ? {
                    kind: "server_unavailable",
                    code: "SOCIAL_CONNECTIONS_CURSOR_REPEATED",
                  }
                : null,
            }
          : {
              ...latest,
              accepted: appendUnique(latest.accepted, page.items),
              acceptedNextCursor: repeatedCursor ? null : page.nextCursor,
              loadingMore: null,
              failure: repeatedCursor
                ? {
                    kind: "server_unavailable",
                    code: "SOCIAL_CONNECTIONS_CURSOR_REPEATED",
                  }
                : null,
            };
      const reconciliationId = ready.reconciliationRequiredConnectionId;
      if (
        reconciliationId &&
        page.items.some((connection) => connection.id === reconciliationId)
      ) {
        ready = {
          ...ready,
          reconciliationRequiredConnectionId: null,
        };
      }
      this.publish(ready);
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: null,
          failure: communityFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  async respond(
    authorityKey: string,
    connectionId: string,
    action: ConnectionResponseAction,
  ): Promise<void> {
    const current = this.ready(authorityKey);
    const connection = current?.pending.find(
      (candidate) => candidate.id === connectionId,
    );
    if (
      !current ||
      current.refreshing ||
      current.loadingMore ||
      current.busyConnectionId ||
      current.reconciliationRequiredConnectionId === connectionId ||
      !connection ||
      connection.status !== "pending" ||
      !connection.incoming ||
      this.operation
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    if (!operation) return;
    this.publish({
      ...current,
      busyConnectionId: connectionId,
      failure: null,
      notice: null,
    });
    try {
      const response = await this.api.respondConnection(
        connectionId,
        action,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish(
        this.withCanonicalConnection(
          {
            ...latest,
            busyConnectionId: null,
            failure: null,
            notice: confirmationCopy(response.connection, action),
          },
          response.connection,
        ),
      );
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const failure = communityFailure(error);
      if (isAmbiguousCommunityMutationFailure(failure)) {
        await this.reconcileMutation(operation, connection, action, failure);
      } else {
        const latest = this.ready(authorityKey);
        if (latest) {
          this.publish({
            ...latest,
            busyConnectionId: null,
            failure,
            notice: null,
          });
        }
      }
    } finally {
      this.finish(operation);
    }
  }

  async disconnect(authorityKey: string, connectionId: string): Promise<void> {
    const current = this.ready(authorityKey);
    const connection = current?.accepted.find(
      (candidate) => candidate.id === connectionId,
    );
    if (
      !current ||
      current.refreshing ||
      current.loadingMore ||
      current.busyConnectionId ||
      current.reconciliationRequiredConnectionId === connectionId ||
      !connection ||
      connection.status !== "accepted" ||
      this.operation
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    if (!operation) return;
    this.publish({
      ...current,
      busyConnectionId: connectionId,
      failure: null,
      notice: null,
    });
    try {
      await this.api.disconnectConnection(
        connectionId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        accepted: latest.accepted.filter(
          (candidate) => candidate.id !== connectionId,
        ),
        busyConnectionId: null,
        failure: null,
        notice: confirmationCopy(connection, "disconnect"),
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const failure = communityFailure(error);
      if (isAmbiguousCommunityMutationFailure(failure)) {
        await this.reconcileMutation(
          operation,
          connection,
          "disconnect",
          failure,
        );
      } else {
        const latest = this.ready(authorityKey);
        if (latest) {
          this.publish({
            ...latest,
            busyConnectionId: null,
            failure,
            notice: null,
          });
        }
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
    this.requestedPendingCursors.clear();
    this.requestedAcceptedCursors.clear();
    this.publish({ kind: "idle", authorityKey: null });
  }

  private async reconcileMutation(
    operation: Operation,
    connection: ConnectionView,
    action: ConnectionMutation,
    failure: CommunityFailure,
  ): Promise<void> {
    try {
      const [pendingPage, acceptedPage, allPage] = await Promise.all([
        this.api.connections(
          { status: "pending", limit: CONNECTIONS_PAGE_SIZE },
          operation.controller.signal,
        ),
        this.api.connections(
          { status: "accepted", limit: CONNECTIONS_PAGE_SIZE },
          operation.controller.signal,
        ),
        this.api.connections(
          { limit: RECONCILIATION_PAGE_SIZE },
          operation.controller.signal,
        ),
      ]);
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(operation.authorityKey);
      if (!latest) return;
      let ready: Extract<SocialConnectionsSnapshot, { kind: "ready" }> = {
        ...latest,
        pending: pendingPage.items,
        pendingNextCursor: pendingPage.nextCursor,
        accepted: acceptedPage.items,
        acceptedNextCursor: acceptedPage.nextCursor,
        busyConnectionId: null,
        failure: null,
        notice: null,
      };
      const observed = allPage.items.find(
        (candidate) => candidate.id === connection.id,
      );
      if (!observed) {
        this.publish({
          ...ready,
          failure,
          notice:
            "No pudimos confirmar el cambio. Revisá la lista antes de volver a intentar.",
          reconciliationRequiredConnectionId: connection.id,
        });
        return;
      }

      ready = this.withCanonicalConnection(ready, observed);
      if (observed.status === expectedStatus(action)) {
        this.publish({
          ...ready,
          failure: null,
          notice: confirmationCopy(observed, action),
          reconciliationRequiredConnectionId: null,
        });
      } else if (observed.status === connection.status) {
        this.publish({
          ...ready,
          failure,
          notice:
            "El servidor todavía muestra la relación anterior. Podés volver a intentar.",
          reconciliationRequiredConnectionId: null,
        });
      } else {
        this.publish({
          ...ready,
          failure: null,
          notice:
            "La relación cambió en otro dispositivo. Actualizamos su estado.",
          reconciliationRequiredConnectionId: null,
        });
      }
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(operation.authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        busyConnectionId: null,
        failure,
        notice:
          "No pudimos confirmar el cambio. Actualizá la lista antes de volver a intentar.",
        reconciliationRequiredConnectionId: connection.id,
      });
    }
  }

  private withCanonicalConnection(
    current: Extract<SocialConnectionsSnapshot, { kind: "ready" }>,
    connection: ConnectionView,
  ): Extract<SocialConnectionsSnapshot, { kind: "ready" }> {
    const pending = current.pending.filter(
      (candidate) => candidate.id !== connection.id,
    );
    const accepted = current.accepted.filter(
      (candidate) => candidate.id !== connection.id,
    );
    if (connection.status === "pending") {
      pending.unshift(connection);
    } else if (connection.status === "accepted") {
      accepted.unshift(connection);
    }
    return {
      ...current,
      pending: pending.slice(0, CONNECTIONS_PAGE_SIZE),
      accepted: accepted.slice(0, CONNECTIONS_PAGE_SIZE),
      busyConnectionId: null,
      reconciliationRequiredConnectionId:
        current.reconciliationRequiredConnectionId === connection.id
          ? null
          : current.reconciliationRequiredConnectionId,
    };
  }

  private ready(
    authorityKey: string,
  ): Extract<SocialConnectionsSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private begin(authorityKey: string): Operation | null {
    if (!this.isAuthorityCurrent(authorityKey)) return null;
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

  private publish(snapshot: SocialConnectionsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
