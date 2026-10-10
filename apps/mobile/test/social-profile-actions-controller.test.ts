import assert from "node:assert/strict";
import test from "node:test";

import type { ConnectionView } from "@losapuntes/contracts/social-qa";

import type {
  ConnectionsPageInput,
  ConnectionsPageResponse,
  SocialConnectionsApi,
  SocialFollowingApi,
} from "../src/features/community/community-api";
import { SocialProfileActionsController } from "../src/features/community/social-profile-actions-controller";
import { ApiRequestError } from "../src/services/api/client";

function connection(
  profileId: string,
  status: ConnectionView["status"],
  requestedByMe = true,
): ConnectionView {
  return {
    id: `connection-${profileId}`,
    status,
    other: { profileId, displayName: "Ada", avatarUrl: null },
    requestedByMe,
    incoming: status === "pending" && !requestedByMe,
    respondedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function apiHarness(
  options: {
    request?: (
      profileId: string,
      call: number,
    ) => Promise<{ connection: ConnectionView }>;
    follow?: (profileId: string, call: number) => Promise<{ following: true }>;
    connections?: (
      input: ConnectionsPageInput,
      call: number,
    ) => Promise<ConnectionsPageResponse> | ConnectionsPageResponse;
  } = {},
) {
  const requestedProfileIds: string[] = [];
  const followedProfileIds: string[] = [];
  const connectionInputs: ConnectionsPageInput[] = [];
  const api: SocialConnectionsApi & Pick<SocialFollowingApi, "followProfile"> =
    {
      connections: async (input) => {
        connectionInputs.push(input);
        return (
          (await options.connections?.(input, connectionInputs.length)) ?? {
            items: [],
            nextCursor: null,
          }
        );
      },
      respondConnection: async () => ({
        connection: connection("profile-a", "pending"),
      }),
      disconnectConnection: async () => undefined,
      requestConnection: async (profileId) => {
        requestedProfileIds.push(profileId);
        return (
          (await options.request?.(profileId, requestedProfileIds.length)) ?? {
            connection: connection(profileId, "pending"),
          }
        );
      },
      followProfile: async (profileId) => {
        followedProfileIds.push(profileId);
        return (
          (await options.follow?.(profileId, followedProfileIds.length)) ?? {
            following: true,
          }
        );
      },
    };
  return { api, requestedProfileIds, followedProfileIds, connectionInputs };
}

test("publishes the server-confirmed connection after a profile request", async () => {
  const confirmed = connection("profile-a", "pending");
  const { api, requestedProfileIds } = apiHarness({
    request: async () => ({ connection: confirmed }),
  });
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");

  await controller.requestConnection("user-a:session-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.connection, confirmed);
  assert.equal(
    snapshot.notice,
    "La solicitud ya está enviada. Esperá la respuesta.",
  );
  assert.deepEqual(requestedProfileIds, ["profile-a"]);
});

test("shows an existing accepted relationship returned by the server and blocks another request", async () => {
  const existing = connection("profile-a", "accepted");
  const { api, requestedProfileIds } = apiHarness({
    request: async () => ({ connection: existing }),
  });
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");

  await controller.requestConnection("user-a:session-a");
  await controller.requestConnection("user-a:session-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.connection, existing);
  assert.equal(snapshot.notice, "Ya tienen una conexión aceptada.");
  assert.deepEqual(requestedProfileIds, ["profile-a"]);
});

test("reconciles an ambiguous request from the bounded server connection page", async () => {
  const confirmed = connection("profile-a", "pending");
  const { api, requestedProfileIds, connectionInputs } = apiHarness({
    request: async () => {
      throw new ApiRequestError(
        "timeout",
        null,
        "REQUEST_TIMEOUT",
        "request timed out",
      );
    },
    connections: async () => ({ items: [confirmed], nextCursor: "more" }),
  });
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");

  await controller.requestConnection("user-a:session-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.connection, confirmed);
  assert.equal(snapshot.reconciliationRequired, false);
  assert.equal(
    snapshot.notice,
    "La solicitud ya está enviada. Esperá la respuesta.",
  );
  assert.deepEqual(requestedProfileIds, ["profile-a"]);
  assert.deepEqual(connectionInputs, [{ limit: 100 }]);
});

test("blocks retries when an ambiguous request is absent from the first connection page", async () => {
  const { api, requestedProfileIds } = apiHarness({
    request: async () => {
      throw new ApiRequestError(
        "timeout",
        null,
        "REQUEST_TIMEOUT",
        "request timed out",
      );
    },
  });
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");

  await controller.requestConnection("user-a:session-a");
  await controller.requestConnection("user-a:session-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.reconciliationRequired, true);
  assert.match(snapshot.notice ?? "", /primera página de tu red/u);
  assert.deepEqual(requestedProfileIds, ["profile-a"]);
});

test("does not apply a delayed profile response after session authority changes", async () => {
  let resolveRequest!: (value: { connection: ConnectionView }) => void;
  const { api } = apiHarness({
    request: async () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
  });
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");
  const oldRequest = controller.requestConnection("user-a:session-a");

  controller.setAuthority("user-b:session-b", "profile-b");
  resolveRequest({ connection: connection("profile-a", "pending") });
  await oldRequest;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "user-b:session-b");
  assert.equal(snapshot.profileId, "profile-b");
  assert.equal(snapshot.connection, null);
  assert.equal(snapshot.busy, false);
});

test("publishes confirmed Follow state and blocks a duplicate action", async () => {
  const { api, followedProfileIds } = apiHarness();
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");

  await controller.followProfile("user-a:session-a");
  await controller.followProfile("user-a:session-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.following, true);
  assert.equal(
    snapshot.followNotice,
    "El servidor confirma que ahora seguís este perfil.",
  );
  assert.deepEqual(followedProfileIds, ["profile-a"]);
});

test("does not apply a delayed Follow response after authority changes", async () => {
  let resolveFollow!: (value: { following: true }) => void;
  const { api } = apiHarness({
    follow: async () =>
      new Promise((resolve) => {
        resolveFollow = resolve;
      }),
  });
  const controller = new SocialProfileActionsController(api);
  controller.setAuthority("user-a:session-a", "profile-a");
  const oldFollow = controller.followProfile("user-a:session-a");

  controller.setAuthority("user-b:session-b", "profile-b");
  resolveFollow({ following: true });
  await oldFollow;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "user-b:session-b");
  assert.equal(snapshot.profileId, "profile-b");
  assert.equal(snapshot.following, false);
  assert.equal(snapshot.followNotice, null);
});
