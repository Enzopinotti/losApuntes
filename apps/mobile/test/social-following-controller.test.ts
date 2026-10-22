import assert from "node:assert/strict";
import test from "node:test";

import type { FollowingItem } from "@losapuntes/contracts/social-qa";

import type {
  FollowingPageInput,
  FollowingPageResponse,
  SocialFollowingApi,
} from "../src/features/community/community-api";
import {
  SOCIAL_FOLLOWING_PAGE_SIZE,
  SocialFollowingController,
} from "../src/features/community/social-following-controller";
import { ApiRequestError } from "../src/services/api/client";

function item(profileId: string): FollowingItem {
  return {
    followedAt: "2026-10-01T00:00:00.000Z",
    profile: { profileId, displayName: `Person ${profileId}`, avatarUrl: null },
  };
}

function page(
  profileIds: string[],
  nextCursor: string | null = null,
): FollowingPageResponse {
  return { items: profileIds.map(item), nextCursor };
}

function apiHarness(
  options: {
    following?: (
      input: FollowingPageInput,
      call: number,
    ) => Promise<FollowingPageResponse> | FollowingPageResponse;
    unfollow?: (profileId: string, call: number) => Promise<void>;
  } = {},
) {
  const requests: FollowingPageInput[] = [];
  const unfollowedProfileIds: string[] = [];
  const api: SocialFollowingApi = {
    following: async (input) => {
      requests.push(input);
      return options.following?.(input, requests.length) ?? page([]);
    },
    followProfile: async () => ({ following: true }),
    unfollowProfile: async (profileId) => {
      unfollowedProfileIds.push(profileId);
      await options.unfollow?.(profileId, unfollowedProfileIds.length);
    },
  };
  return { api, requests, unfollowedProfileIds };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

test("loads bounded pages and preserves opaque cursors without duplicate profiles", async () => {
  const { api, requests } = apiHarness({
    following: (input) =>
      input.cursor
        ? page(["profile-b", "profile-c"])
        : page(["profile-a", "profile-b"], "next-following-page"),
  });
  const controller = new SocialFollowingController(api);
  controller.setAuthority("user-a:session-a");

  await controller.load("user-a:session-a");
  await controller.loadMore("user-a:session-a");

  assert.equal(SOCIAL_FOLLOWING_PAGE_SIZE, 25);
  assert.deepEqual(requests, [
    { limit: 25 },
    { limit: 25, cursor: "next-following-page" },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.items.map((following) => following.profile.profileId),
    ["profile-a", "profile-b", "profile-c"],
  );
  assert.equal(snapshot.nextCursor, null);
});

test("keeps transient pages retryable and stops a following cursor cycle", async () => {
  const requests: FollowingPageInput[] = [];
  let pageCalls = 0;
  const { api } = apiHarness({
    following: (input) => {
      requests.push(input);
      if (!input.cursor) return page(["profile-a"], "cursor-a");
      pageCalls += 1;
      if (pageCalls === 1) {
        throw new ApiRequestError(
          "server_unavailable",
          503,
          "TEMPORARY_UNAVAILABLE",
          "temporary failure",
        );
      }
      return input.cursor === "cursor-a"
        ? page(["profile-b"], "cursor-b")
        : page(["profile-c"], "cursor-a");
    },
  });
  const controller = new SocialFollowingController(api);
  controller.setAuthority("user-a:session-a");

  await controller.load("user-a:session-a");
  await controller.loadMore("user-a:session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.nextCursor, "cursor-a");
  assert.equal(snapshot.failure?.kind, "server_unavailable");

  await controller.loadMore("user-a:session-a");
  await controller.loadMore("user-a:session-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.items.map((following) => following.profile.profileId),
    ["profile-a", "profile-b", "profile-c"],
  );
  assert.equal(snapshot.nextCursor, null);
  assert.equal(snapshot.failure?.code, "SOCIAL_FOLLOWING_CURSOR_REPEATED");
  assert.deepEqual(
    requests.map((request) => request.cursor),
    [undefined, "cursor-a", "cursor-a", "cursor-b"],
  );
});

test("removes a profile only after the server confirms unfollow", async () => {
  const { api, unfollowedProfileIds } = apiHarness({
    following: () => page(["profile-a", "profile-b"]),
  });
  const controller = new SocialFollowingController(api);
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a");

  await controller.unfollow("user-a:session-a", "profile-a");
  await controller.unfollow("user-a:session-a", "profile-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.items.map((following) => following.profile.profileId),
    ["profile-b"],
  );
  assert.equal(snapshot.notice, "Dejaste de seguir a Person profile-a.");
  assert.deepEqual(unfollowedProfileIds, ["profile-a"]);
});

test("keeps an uncertain unfollow retryable because the server operation is idempotent", async () => {
  const { api, unfollowedProfileIds } = apiHarness({
    following: () => page(["profile-a"]),
    unfollow: async (_profileId, call) => {
      if (call === 1) {
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "request timed out",
        );
      }
    },
  });
  const controller = new SocialFollowingController(api);
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a");

  await controller.unfollow("user-a:session-a", "profile-a");
  const afterTimeout = controller.getSnapshot();
  assert.equal(afterTimeout.kind, "ready");
  if (afterTimeout.kind !== "ready") return;
  assert.equal(afterTimeout.items[0]?.profile.profileId, "profile-a");
  assert.equal(afterTimeout.failure?.kind, "timeout");

  await controller.unfollow("user-a:session-a", "profile-a");

  const afterRetry = controller.getSnapshot();
  assert.equal(afterRetry.kind, "ready");
  if (afterRetry.kind !== "ready") return;
  assert.equal(afterRetry.items.length, 0);
  assert.deepEqual(unfollowedProfileIds, ["profile-a", "profile-a"]);
});

test("fences a delayed following page after the account changes", async () => {
  const oldPage = deferred<FollowingPageResponse>();
  let call = 0;
  const { api } = apiHarness({
    following: () => {
      call += 1;
      return call === 1 ? oldPage.promise : page(["current-profile"]);
    },
  });
  const controller = new SocialFollowingController(api);
  controller.setAuthority("user-a:session-a");
  const oldLoad = controller.load("user-a:session-a");

  controller.setAuthority("user-b:session-b");
  await controller.load("user-b:session-b");
  oldPage.resolve(page(["stale-profile"]));
  await oldLoad;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "user-b:session-b");
  assert.deepEqual(
    snapshot.items.map((following) => following.profile.profileId),
    ["current-profile"],
  );
});

test("does not publish an unfollow completion after authority changes", async () => {
  const pending = deferred<void>();
  const { api } = apiHarness({
    following: (_input, call) => (call === 1 ? page(["profile-a"]) : page([])),
    unfollow: () => pending.promise,
  });
  const controller = new SocialFollowingController(api);
  controller.setAuthority("user-a:session-a");
  await controller.load("user-a:session-a");
  const oldAction = controller.unfollow("user-a:session-a", "profile-a");

  controller.setAuthority("user-b:session-b");
  await controller.load("user-b:session-b");
  pending.resolve(undefined);
  await oldAction;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "user-b:session-b");
  assert.deepEqual(snapshot.items, []);
  assert.equal(snapshot.notice, null);
});
