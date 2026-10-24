import assert from "node:assert/strict";
import test from "node:test";

import type {
  CommunityNotificationsApi,
  MobileNotificationPage,
  MobileNotificationView,
  NotificationPageInput,
} from "../src/features/community/community-api";
import {
  MOBILE_NOTIFICATION_PAGE_SIZE,
  MOBILE_NOTIFICATION_RECONCILE_INTERVAL_MS,
  MobileNotificationsController,
  shouldReconcileMobileNotifications,
} from "../src/features/notifications/notifications-controller";
import { ApiRequestError } from "../src/services/api/client";

const notification = (
  id: string,
  readAt: string | null = null,
): MobileNotificationView => ({
  id,
  type: "social.followed",
  actor: { profileId: "profile-a", displayName: "Ada", avatarUrl: null },
  target: { type: "profile", id: "profile-a" },
  readAt,
  createdAt: "2026-10-01T12:00:00.000Z",
});

const page = (
  ids: string[],
  nextCursor: string | null = null,
): MobileNotificationPage => ({
  items: ids.map((id) => notification(id)),
  nextCursor,
});

function apiHarness(
  notifications: (
    input: NotificationPageInput,
    call: number,
  ) => Promise<MobileNotificationPage> | MobileNotificationPage,
) {
  const calls: NotificationPageInput[] = [];
  const actions: string[] = [];
  const api: CommunityNotificationsApi = {
    notifications: (input: NotificationPageInput) => {
      calls.push(input);
      return Promise.resolve(notifications(input, calls.length));
    },
    markNotificationRead: async (id: string) => {
      actions.push(`read:${id}`);
      return { read: true as const };
    },
    markAllNotificationsRead: async () => {
      actions.push("read-all");
      return { updated: 1 };
    },
  };
  return { api, calls, actions };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

test("replaces stale results when session authority changes", async () => {
  const first = deferred<MobileNotificationPage>();
  let call = 0;
  const { api } = apiHarness(() => {
    call += 1;
    return call === 1 ? first.promise : page(["current"]);
  });
  const controller = new MobileNotificationsController(api);
  const staleRequest = controller.load("user-a:session-a", false);
  const currentRequest = controller.load("user-b:session-b", false);
  await currentRequest;
  first.resolve(page(["stale"]));
  await staleRequest;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "user-b:session-b");
    assert.deepEqual(
      snapshot.data.items.map((item) => item.id),
      ["current"],
    );
  }
});

test("reconciles only pages already loaded and refreshes their cursors", async () => {
  const { api, calls } = apiHarness((input, call) => {
    if (call === 1) return page(["one"], "cursor-1");
    if (call === 2) return page(["two"], "cursor-2");
    if (call === 3) return page(["three"]);
    if (call === 4) return page(["new-one"], "cursor-1b");
    if (call === 5) return page(["new-two"], "cursor-2b");
    return page(["new-three"]);
  });
  const controller = new MobileNotificationsController(api);
  await controller.load("user:session", false);
  await controller.loadMore("user:session");
  await controller.loadMore("user:session");
  await controller.reconcile("user:session");

  assert.equal(MOBILE_NOTIFICATION_PAGE_SIZE, 30);
  assert.equal(MOBILE_NOTIFICATION_RECONCILE_INTERVAL_MS, 30_000);
  assert.deepEqual(
    calls.map(({ cursor }) => cursor ?? null),
    [null, "cursor-1", "cursor-2", null, "cursor-1b", "cursor-2b"],
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.loadedPages, 3);
    assert.equal(snapshot.data.nextCursor, null);
    assert.deepEqual(
      snapshot.data.items.map(({ id }) => id),
      ["new-one", "new-two", "new-three"],
    );
  }
});

test("keeps notification pages retryable and stops a repeated cursor cycle", async () => {
  const { api, calls } = apiHarness((input, call) => {
    if (!input.cursor) return page(["one"], "cursor-a");
    if (call === 2) {
      throw new ApiRequestError(
        "server_unavailable",
        503,
        "TEMPORARY_UNAVAILABLE",
        "temporary failure",
      );
    }
    return input.cursor === "cursor-a"
      ? page(["two"], "cursor-b")
      : page(["two", "three"], "cursor-a");
  });
  const controller = new MobileNotificationsController(api);
  await controller.load("user:session", false);

  await controller.loadMore("user:session");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.data.nextCursor, "cursor-a");
  assert.equal(snapshot.failure?.kind, "server_unavailable");

  await controller.loadMore("user:session");
  await controller.loadMore("user:session");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["one", "two", "three"],
  );
  assert.equal(snapshot.data.nextCursor, null);
  assert.equal(snapshot.failure?.code, "MOBILE_NOTIFICATIONS_CURSOR_REPEATED");
  assert.deepEqual(
    calls.map((input) => input.cursor),
    [undefined, "cursor-a", "cursor-a", "cursor-b"],
  );
});

test("stops notification reconciliation when the server cycles a page cursor", async () => {
  const { api, calls } = apiHarness((input, call) => {
    if (call === 1) return page(["old-one"], "cursor-a");
    if (call === 2) return page(["old-two"], "cursor-b");
    if (call === 3) return page(["fresh-one"], "cursor-a");
    return page(["fresh-two"], "cursor-a");
  });
  const controller = new MobileNotificationsController(api);
  await controller.load("user:session", false);
  await controller.loadMore("user:session");
  await controller.reconcile("user:session");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["fresh-one", "fresh-two"],
  );
  assert.equal(snapshot.data.nextCursor, null);
  assert.equal(snapshot.failure?.code, "MOBILE_NOTIFICATIONS_CURSOR_REPEATED");
  assert.deepEqual(
    calls.map((input) => input.cursor),
    [undefined, "cursor-a", undefined, "cursor-a"],
  );
});

test("read actions reconcile the loaded list from the server", async () => {
  const { api, calls, actions } = apiHarness((input, call) => {
    if (call === 1) return page(["unread"], "cursor-next");
    if (call === 2) {
      return {
        items: [notification("unread", "2026-10-02T12:00:00.000Z")],
        nextCursor: "cursor-next",
      };
    }
    return page([]);
  });
  const controller = new MobileNotificationsController(api);
  await controller.load("user:session", false);
  await controller.markRead("user:session", "unread");

  assert.deepEqual(actions, ["read:unread"]);
  assert.equal(calls.length, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.items[0]?.readAt, "2026-10-02T12:00:00.000Z");
    assert.equal(snapshot.actionBusy, false);
  }
});

test("screen suspension preserves and reconciles the loaded page window", async () => {
  const { api, calls } = apiHarness((input, call) => {
    if (call === 1) return page(["one"], "cursor-1");
    if (call === 2) return page(["two"], "cursor-2");
    if (call === 3) return page(["fresh-one"], "cursor-1b");
    return page(["fresh-two"], "cursor-2b");
  });
  const controller = new MobileNotificationsController(api);
  await controller.load("user:session", false);
  await controller.loadMore("user:session");
  controller.suspend("user:session");

  const suspended = controller.getSnapshot();
  assert.equal(suspended.kind, "ready");
  if (suspended.kind === "ready") {
    assert.equal(suspended.loadedPages, 2);
    assert.deepEqual(
      suspended.data.items.map(({ id }) => id),
      ["one", "two"],
    );
  }

  await controller.reconcile("user:session");
  assert.deepEqual(
    calls.map(({ cursor }) => cursor ?? null),
    [null, "cursor-1", null, "cursor-1b"],
  );
  const resumed = controller.getSnapshot();
  assert.equal(resumed.kind, "ready");
  if (resumed.kind === "ready") {
    assert.equal(resumed.loadedPages, 2);
    assert.deepEqual(
      resumed.data.items.map(({ id }) => id),
      ["fresh-one", "fresh-two"],
    );
  }
});

test("quiet foreground reconciliation preserves the last good page on failure", async () => {
  const { api } = apiHarness((_input, call) => {
    if (call === 1) return page(["retained"]);
    throw new Error("temporarily unavailable");
  });
  const controller = new MobileNotificationsController(api);
  await controller.load("user:session", false);
  await controller.reconcile("user:session");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.items[0]?.id, "retained");
    assert.equal(snapshot.failure, null);
  }
});

test("reconciliation is limited to a focused active screen", () => {
  assert.equal(shouldReconcileMobileNotifications(true, "active"), true);
  assert.equal(shouldReconcileMobileNotifications(false, "active"), false);
  assert.equal(shouldReconcileMobileNotifications(true, "background"), false);
});

test("opening an unread notification marks it read before approving navigation", async () => {
  const { api, calls, actions } = apiHarness((_input, call) =>
    call === 1
      ? page(["unread"])
      : {
          items: [notification("unread", "2026-10-12T12:00:00.000Z")],
          nextCursor: null,
        },
  );
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  const canOpen = await controller.openAndMarkRead(
    "user-a:session-a",
    "unread",
  );

  assert.equal(canOpen, true);
  assert.deepEqual(actions, ["read:unread"]);
  assert.equal(calls.length, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.items[0]?.readAt, "2026-10-12T12:00:00.000Z");
    assert.equal(snapshot.actionBusy, false);
  }
});

test("opening an already read notification navigates without another mutation", async () => {
  const { api, actions, calls } = apiHarness(() => ({
    items: [notification("read", "2026-10-11T12:00:00.000Z")],
    nextCursor: null,
  }));
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  assert.equal(
    await controller.openAndMarkRead("user-a:session-a", "read"),
    true,
  );
  assert.deepEqual(actions, []);
  assert.equal(calls.length, 1);
});

test("opening a missing or another-account notification is denied", async () => {
  const { api, actions } = apiHarness(() => page(["current"]));
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  assert.equal(
    await controller.openAndMarkRead("user-b:session-b", "current"),
    false,
  );
  assert.equal(
    await controller.openAndMarkRead("user-a:session-a", "missing"),
    false,
  );
  assert.deepEqual(actions, []);
});

test("a rejected read mutation keeps the notification available and denies navigation", async () => {
  const { api } = apiHarness(() => page(["unread"]));
  api.markNotificationRead = async () => {
    throw new ApiRequestError(
      "offline",
      null,
      "NETWORK_UNAVAILABLE",
      "offline",
    );
  };
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  assert.equal(
    await controller.openAndMarkRead("user-a:session-a", "unread"),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.items[0]?.readAt, null);
    assert.equal(snapshot.failure?.kind, "offline");
    assert.equal(snapshot.actionBusy, false);
  }
});

test("late read success from a replaced account cannot approve old navigation", async () => {
  const pending = deferred<{ read: true }>();
  const { api, calls } = apiHarness((_input, call) =>
    call === 1 ? page(["old"]) : page(["new"]),
  );
  let signal: AbortSignal | undefined;
  api.markNotificationRead = async (_id, nextSignal) => {
    signal = nextSignal;
    return pending.promise;
  };
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  const opening = controller.openAndMarkRead("user-a:session-a", "old");
  await controller.load("user-b:session-b", false);
  pending.resolve({ read: true });

  assert.equal(await opening, false);
  assert.equal(signal?.aborted, true);
  assert.equal(calls.length, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "user-b:session-b");
    assert.deepEqual(
      snapshot.data.items.map((item) => item.id),
      ["new"],
    );
  }
});

test("suspending the inbox prevents a late read from opening a destination", async () => {
  const pending = deferred<{ read: true }>();
  const { api } = apiHarness(() => page(["old"]));
  api.markNotificationRead = async () => pending.promise;
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  const opening = controller.openAndMarkRead("user-a:session-a", "old");
  controller.suspend("user-a:session-a");
  pending.resolve({ read: true });

  assert.equal(await opening, false);
  assert.equal(controller.getSnapshot().kind, "ready");
  const snapshot = controller.getSnapshot();
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.items[0]?.readAt, null);
    assert.equal(snapshot.actionBusy, false);
  }
});

test("a second open during an in-flight read cannot issue duplicate mutations", async () => {
  const pending = deferred<{ read: true }>();
  const { api } = apiHarness(() => page(["old"]));
  let mutations = 0;
  api.markNotificationRead = async () => {
    mutations += 1;
    return pending.promise;
  };
  const controller = new MobileNotificationsController(api);
  await controller.load("user-a:session-a", false);

  const opening = controller.openAndMarkRead("user-a:session-a", "old");
  assert.equal(
    await controller.openAndMarkRead("user-a:session-a", "old"),
    false,
  );
  pending.resolve({ read: true });

  assert.equal(await opening, true);
  assert.equal(mutations, 1);
});
