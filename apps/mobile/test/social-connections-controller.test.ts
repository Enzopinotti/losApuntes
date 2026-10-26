import assert from "node:assert/strict";
import test from "node:test";

import type {
  ConnectionView,
  ConnectionStatus,
} from "@losapuntes/contracts/social-qa";

import { SocialConnectionsController } from "../src/features/community/social-connections-controller";
import type { SocialConnectionsApi } from "../src/features/community/community-api";
import { ApiRequestError } from "../src/services/api/client";

const connection = (
  id: string,
  status: ConnectionStatus,
  incoming = status === "pending",
): ConnectionView => ({
  id,
  status,
  other: {
    profileId: `profile-${id}`,
    displayName: `Person ${id}`,
    avatarUrl: null,
  },
  requestedByMe: status === "pending" && !incoming,
  incoming: status === "pending" && incoming,
  respondedAt: status === "accepted" ? "2026-10-02T00:00:00.000Z" : null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
});

const emptyPage = { items: [], nextCursor: null };

function api(
  overrides: Partial<SocialConnectionsApi> = {},
): SocialConnectionsApi {
  return {
    connections: async ({ status }) =>
      status === "pending"
        ? { items: [connection("incoming-a", "pending")], nextCursor: null }
        : status === "accepted"
          ? { items: [connection("accepted-a", "accepted")], nextCursor: null }
          : {
              items: [
                connection("incoming-a", "pending"),
                connection("accepted-a", "accepted"),
              ],
              nextCursor: null,
            },
    respondConnection: async (id, action) => ({
      connection: connection(id, action === "accept" ? "accepted" : "declined"),
    }),
    disconnectConnection: async () => undefined,
    requestConnection: async (profileId) => ({
      connection: {
        ...connection(profileId, "pending", false),
        other: {
          profileId,
          displayName: `Person ${profileId}`,
          avatarUrl: null,
        },
      },
    }),
    ...overrides,
  };
}

const readySnapshot = (controller: SocialConnectionsController) => {
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready snapshot");
  return snapshot;
};

test("loads server-paged pending and accepted connections under the active authority", async () => {
  const requests: Array<{
    status?: ConnectionStatus;
    cursor?: string;
    limit?: number;
  }> = [];
  const controller = new SocialConnectionsController(
    api({
      connections: async (input) => {
        requests.push(input);
        return input.status === "pending"
          ? {
              items: [connection("incoming-a", "pending")],
              nextCursor: "pending-next",
            }
          : input.status === "accepted"
            ? {
                items: [connection("accepted-a", "accepted")],
                nextCursor: "accepted-next",
              }
            : emptyPage;
      },
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.load("user-a:session-a", "incoming-a");

  const snapshot = readySnapshot(controller);
  assert.deepEqual(requests, [
    { status: "pending", limit: 25 },
    { status: "accepted", limit: 25 },
    { limit: 100 },
  ]);
  assert.equal(snapshot.pending[0]?.id, "incoming-a");
  assert.equal(snapshot.accepted[0]?.id, "accepted-a");
  assert.equal(snapshot.targetConnectionId, "incoming-a");
  assert.equal(snapshot.pendingNextCursor, "pending-next");
  assert.equal(snapshot.acceptedNextCursor, "accepted-next");
});

test("pages with the opaque cursor and deduplicates by connection id", async () => {
  const requests: Array<{ status?: ConnectionStatus; cursor?: string }> = [];
  const controller = new SocialConnectionsController(
    api({
      connections: async (input) => {
        requests.push(input);
        if (input.status === "pending" && !input.cursor) {
          return {
            items: [connection("incoming-a", "pending")],
            nextCursor: "opaque-pending-next",
          };
        }
        if (input.status === "pending") {
          return {
            items: [
              connection("incoming-a", "pending"),
              connection("incoming-b", "pending"),
            ],
            nextCursor: null,
          };
        }
        return emptyPage;
      },
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.load("user-a:session-a", null);
  await controller.loadMore("user-a:session-a", "pending");

  assert.deepEqual(requests[2], {
    status: "pending",
    limit: 25,
    cursor: "opaque-pending-next",
  });
  assert.deepEqual(
    readySnapshot(controller).pending.map((item) => item.id),
    ["incoming-a", "incoming-b"],
  );
});

test("stops a repeated pending cursor without consuming the accepted list cursor", async () => {
  const requests: Array<{ status?: ConnectionStatus; cursor?: string }> = [];
  const controller = new SocialConnectionsController(
    api({
      connections: async (input) => {
        requests.push(input);
        if (input.status === "pending") {
          return input.cursor
            ? {
                items: [connection("incoming-b", "pending")],
                nextCursor: "shared-cursor",
              }
            : {
                items: [connection("incoming-a", "pending")],
                nextCursor: "shared-cursor",
              };
        }
        if (input.status === "accepted") {
          return input.cursor
            ? {
                items: [connection("accepted-b", "accepted")],
                nextCursor: null,
              }
            : {
                items: [connection("accepted-a", "accepted")],
                nextCursor: "shared-cursor",
              };
        }
        return emptyPage;
      },
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.load("user-a:session-a", null);
  await controller.loadMore("user-a:session-a", "pending");
  const afterPendingLoop = readySnapshot(controller);
  assert.deepEqual(
    afterPendingLoop.pending.map((item) => item.id),
    ["incoming-a", "incoming-b"],
  );
  assert.equal(afterPendingLoop.pendingNextCursor, null);
  assert.equal(
    afterPendingLoop.failure?.code,
    "SOCIAL_CONNECTIONS_CURSOR_REPEATED",
  );
  assert.equal(afterPendingLoop.acceptedNextCursor, "shared-cursor");

  await controller.loadMore("user-a:session-a", "accepted");
  const afterAcceptedPage = readySnapshot(controller);
  assert.deepEqual(
    afterAcceptedPage.accepted.map((item) => item.id),
    ["accepted-a", "accepted-b"],
  );
  assert.equal(afterAcceptedPage.acceptedNextCursor, null);
  assert.equal(afterAcceptedPage.failure, null);
  assert.deepEqual(
    requests.map(({ status, cursor }) => `${status}:${cursor ?? "first"}`),
    [
      "pending:first",
      "accepted:first",
      "pending:shared-cursor",
      "accepted:shared-cursor",
    ],
  );
});

test("accepting an incoming request moves the canonical response to connections", async () => {
  const accepted = connection("incoming-a", "accepted", false);
  let actionCalls = 0;
  const controller = new SocialConnectionsController(
    api({
      respondConnection: async () => {
        actionCalls += 1;
        return { connection: accepted };
      },
    }),
  );
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a", null);

  await controller.respond("user-a:session-a", "incoming-a", "accept");

  const snapshot = readySnapshot(controller);
  assert.equal(actionCalls, 1);
  assert.equal(
    snapshot.pending.some((item) => item.id === "incoming-a"),
    false,
  );
  assert.equal(
    snapshot.accepted.find((item) => item.id === "incoming-a")?.status,
    "accepted",
  );
  assert.equal(snapshot.notice, "Aceptaste la solicitud de Person incoming-a.");
});

test("declining removes a pending request and disconnecting removes an accepted relation", async () => {
  let currentPending = [connection("incoming-a", "pending")];
  let currentAccepted = [connection("accepted-a", "accepted")];
  const controller = new SocialConnectionsController(
    api({
      connections: async ({ status }) =>
        status === "pending"
          ? { items: currentPending, nextCursor: null }
          : status === "accepted"
            ? { items: currentAccepted, nextCursor: null }
            : {
                items: [...currentPending, ...currentAccepted],
                nextCursor: null,
              },
      respondConnection: async (id) => {
        currentPending = currentPending.filter((item) => item.id !== id);
        return { connection: connection(id, "declined") };
      },
      disconnectConnection: async (id) => {
        currentAccepted = currentAccepted.filter((item) => item.id !== id);
      },
    }),
  );
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a", null);

  await controller.respond("user-a:session-a", "incoming-a", "decline");
  assert.equal(readySnapshot(controller).pending.length, 0);
  assert.equal(
    readySnapshot(controller).notice,
    "Rechazaste la solicitud de Person incoming-a.",
  );

  await controller.disconnect("user-a:session-a", "accepted-a");
  assert.equal(readySnapshot(controller).accepted.length, 0);
  assert.equal(
    readySnapshot(controller).notice,
    "Desconectaste a Person accepted-a.",
  );
});

test("reconciles an ambiguous accept from server truth without repeating the mutation", async () => {
  const pending = [connection("incoming-a", "pending")];
  const accepted = [connection("accepted-a", "accepted")];
  const committed = connection("incoming-a", "accepted", false);
  let mutationCalls = 0;
  let committedServerSide = false;
  const controller = new SocialConnectionsController(
    api({
      connections: async ({ status }) => {
        if (status === "pending") {
          return {
            items: committedServerSide ? [] : pending,
            nextCursor: null,
          };
        }
        if (status === "accepted") {
          return {
            items: committedServerSide ? [committed, ...accepted] : accepted,
            nextCursor: null,
          };
        }
        return {
          items: committedServerSide
            ? [committed, ...accepted]
            : [...pending, ...accepted],
          nextCursor: null,
        };
      },
      respondConnection: async () => {
        mutationCalls += 1;
        committedServerSide = true;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "The server committed before the response timed out",
        );
      },
    }),
  );
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a", null);

  await controller.respond("user-a:session-a", "incoming-a", "accept");

  const snapshot = readySnapshot(controller);
  assert.equal(mutationCalls, 1);
  assert.equal(
    snapshot.pending.some((item) => item.id === "incoming-a"),
    false,
  );
  assert.equal(
    snapshot.accepted.find((item) => item.id === "incoming-a")?.status,
    "accepted",
  );
  assert.equal(snapshot.reconciliationRequiredConnectionId, null);
  assert.equal(snapshot.notice, "Aceptaste la solicitud de Person incoming-a.");
});

test("does not repeat an ambiguous mutation when reconciliation cannot find the relation", async () => {
  let mutationCalls = 0;
  let afterMutation = false;
  const controller = new SocialConnectionsController(
    api({
      connections: async ({ status }) => {
        if (afterMutation) throw new Error("reconciliation unavailable");
        return status === "pending"
          ? { items: [connection("incoming-a", "pending")], nextCursor: null }
          : status === "accepted"
            ? emptyPage
            : {
                items: [connection("incoming-a", "pending")],
                nextCursor: null,
              };
      },
      respondConnection: async () => {
        mutationCalls += 1;
        afterMutation = true;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "ambiguous",
        );
      },
    }),
  );
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a", null);

  await controller.respond("user-a:session-a", "incoming-a", "accept");
  await controller.respond("user-a:session-a", "incoming-a", "accept");

  const snapshot = readySnapshot(controller);
  assert.equal(mutationCalls, 1);
  assert.equal(snapshot.reconciliationRequiredConnectionId, "incoming-a");
  assert.match(snapshot.notice ?? "", /no pudimos confirmar/iu);
});

test("a delayed page from the previous session cannot replace the new authority", async () => {
  let resolveFirstPending!: (value: {
    items: ConnectionView[];
    nextCursor: string | null;
  }) => void;
  let pendingRequests = 0;
  const controller = new SocialConnectionsController(
    api({
      connections: async (input) => {
        if (input.status === "pending" && pendingRequests++ === 0) {
          return new Promise((resolve) => {
            resolveFirstPending = resolve;
          });
        }
        return emptyPage;
      },
    }),
  );
  controller.setAuthority("user-a:session-a");
  const oldLoad = controller.load("user-a:session-a", null);

  controller.setAuthority("user-b:session-b");
  await controller.load("user-b:session-b", null);
  resolveFirstPending({
    items: [connection("old-session", "pending")],
    nextCursor: null,
  });
  await oldLoad;

  const snapshot = readySnapshot(controller);
  assert.equal(snapshot.authorityKey, "user-b:session-b");
  assert.equal(
    snapshot.pending.some((item) => item.id === "old-session"),
    false,
  );
});

test("accepted cursor cycles retain new rows, retry failures and reset across authorities", async () => {
  const requests: string[] = [];
  let failAcceptedOnce = true;
  const controller = new SocialConnectionsController(
    api({
      connections: async ({ status, cursor }) => {
        if (cursor) requests.push(`${status}:${cursor}`);
        if (status === "pending")
          return {
            items: [connection(cursor ? "pending-b" : "pending-a", "pending")],
            nextCursor: cursor ? null : "cursor-a",
          };
        if (status !== "accepted") return emptyPage;
        if (!cursor)
          return {
            items: [connection("accepted-a", "accepted")],
            nextCursor: "cursor-a",
          };
        if (cursor === "cursor-a" && failAcceptedOnce) {
          failAcceptedOnce = false;
          throw new Error("temporary page failure");
        }
        return cursor === "cursor-a"
          ? {
              items: [
                connection("accepted-a", "accepted"),
                connection("accepted-b", "accepted"),
              ],
              nextCursor: "cursor-b",
            }
          : {
              items: [
                connection("accepted-b", "accepted"),
                connection("accepted-c", "accepted"),
              ],
              nextCursor: "cursor-a",
            };
      },
    }),
  );
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a", null);
  await controller.loadMore("user-a:session-a", "accepted");
  assert.equal(readySnapshot(controller).acceptedNextCursor, "cursor-a");
  await controller.loadMore("user-a:session-a", "accepted");
  await controller.loadMore("user-a:session-a", "accepted");
  const stopped = readySnapshot(controller);
  assert.deepEqual(
    stopped.accepted.map((item) => item.id),
    ["accepted-a", "accepted-b", "accepted-c"],
  );
  assert.equal(stopped.acceptedNextCursor, null);
  assert.equal(stopped.failure?.code, "SOCIAL_CONNECTIONS_CURSOR_REPEATED");
  assert.equal(stopped.pendingNextCursor, "cursor-a");
  await controller.loadMore("user-a:session-a", "pending");
  assert.deepEqual(
    readySnapshot(controller).pending.map((item) => item.id),
    ["pending-a", "pending-b"],
  );
  controller.setAuthority("user-b:session-b");
  await controller.load("user-b:session-b", null);
  await controller.loadMore("user-b:session-b", "accepted");
  assert.equal(readySnapshot(controller).acceptedNextCursor, "cursor-b");
  assert.equal(readySnapshot(controller).failure, null);
  assert.deepEqual(requests, [
    "accepted:cursor-a",
    "accepted:cursor-a",
    "accepted:cursor-b",
    "pending:cursor-a",
    "accepted:cursor-a",
  ]);
});
