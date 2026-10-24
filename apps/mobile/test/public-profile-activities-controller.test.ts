import assert from "node:assert/strict";
import test from "node:test";

import type {
  ProfileActivity,
  ProfileActivityPageResponse,
  PublicProfileResponse,
} from "@losapuntes/contracts";

import type { MobileSearchApi } from "../src/features/search/search-api";
import { PublicProfileActivitiesController } from "../src/features/search/public-profile-activities-controller";
import { ApiRequestError } from "../src/services/api/client";

const activity = (id: string, title = `Actividad ${id}`): ProfileActivity => ({
  id,
  type: "project",
  title,
  description: null,
  url: null,
  startedOn: null,
  endedOn: null,
  revision: 1,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
});

const profile = (
  overrides: Partial<PublicProfileResponse["profile"]> = {},
): PublicProfileResponse["profile"] => ({
  id: "profile-a",
  revision: 1,
  presentation: {
    accentPreset: "default",
    coverPreset: "default",
    sectionOrder: ["about", "activities"],
  },
  activities: [activity("a1")],
  activitiesNextCursor: "cursor-1",
  activitiesLimit: 20,
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const makeController = (
  publicProfileActivities: MobileSearchApi["publicProfileActivities"],
) => new PublicProfileActivitiesController({ publicProfileActivities });

test("loads the next page, deduplicates overlap, and advances its cursor", async () => {
  let receivedCall: {
    profileId: string;
    cursor: string;
    limit: number;
  } | null = null;
  const controller = makeController(async (profileId, cursor, limit) => {
    receivedCall = { profileId, cursor, limit };
    return {
      items: [activity("a1", "Actividad actualizada"), activity("a2")],
      nextCursor: "cursor-2",
    };
  });
  controller.setProfile("authority-a", profile());

  await controller.loadMore("authority-a", "profile-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.items.map((item) => item.id),
    ["a1", "a2"],
  );
  assert.equal(snapshot.items[0]?.title, "Actividad actualizada");
  assert.equal(snapshot.nextCursor, "cursor-2");
  assert.equal(snapshot.loadingMore, false);
  assert.deepEqual(receivedCall, {
    profileId: "profile-a",
    cursor: "cursor-1",
    limit: 20,
  });
});

test("keeps the cursor after a failed page so the user can retry", async () => {
  let attempt = 0;
  const controller = makeController(async () => {
    attempt += 1;
    if (attempt === 1) {
      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "offline",
      );
    }
    return { items: [activity("a2")], nextCursor: null };
  });
  controller.setProfile("authority-a", profile());

  await controller.loadMore("authority-a", "profile-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.failure, "offline");
  assert.equal(snapshot.nextCursor, "cursor-1");

  await controller.loadMore("authority-a", "profile-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.items.map((item) => item.id),
    ["a1", "a2"],
  );
  assert.equal(snapshot.nextCursor, null);
  assert.equal(snapshot.failure, null);
});

test("ignores a page response after its profile authority is invalidated", async () => {
  const pending = deferred<ProfileActivityPageResponse>();
  const controller = makeController(() => pending.promise);
  controller.setProfile("authority-a", profile());

  const request = controller.loadMore("authority-a", "profile-a");
  controller.invalidate("authority-a");
  pending.resolve({ items: [activity("a2")], nextCursor: null });
  await request;

  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("does not send duplicate requests while a page is in flight", async () => {
  const pending = deferred<ProfileActivityPageResponse>();
  let requestCount = 0;
  const controller = makeController(() => {
    requestCount += 1;
    return pending.promise;
  });
  controller.setProfile("authority-a", profile());

  const first = controller.loadMore("authority-a", "profile-a");
  const second = controller.loadMore("authority-a", "profile-a");
  assert.equal(requestCount, 1);
  pending.resolve({ items: [activity("a2")], nextCursor: null });
  await Promise.all([first, second]);

  assert.equal(requestCount, 1);
});
