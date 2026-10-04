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
