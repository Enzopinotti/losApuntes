import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcademicCurrentContext,
  PilotHomeResponse,
  FeedItem,
} from "@losapuntes/contracts";

import {
  academicContextBelongsToSession,
  canLoadMoreHomeFeed,
  MobileHomeController,
  MAX_HOME_FEED_ITEMS,
  HOME_FEED_PAGE_SIZE,
  type PilotHomeApi,
} from "../src/features/home/home-controller";
import { ApiRequestError } from "../src/services/api/client";

const context = (
  affiliationId = "aff-a",
  subjectParticipationId: string | undefined = "part-a",
): AcademicCurrentContext => ({
  affiliationId,
  ...(subjectParticipationId ? { subjectParticipationId } : {}),
  revision: 1,
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const home = (
  currentContext: AcademicCurrentContext | null = context(),
): PilotHomeResponse => ({
  profileReady: true,
  lifecycle: {
    phase: "student",
    activeStudentAffiliationIds: ["aff-a"],
    alumniAffiliationIds: [],
    currentSubjectIds: currentContext?.subjectParticipationId
      ? ["subject-a"]
      : [],
    hasCurrentSubjectContext: Boolean(currentContext?.subjectParticipationId),
    currentAffiliationId: currentContext?.affiliationId ?? null,
    follows: [],
    followsTruncated: false,
    followsLimit: 20,
  },
  academic: {
    currentContext,
    currentSubjectIds: currentContext?.subjectParticipationId
      ? ["subject-a"]
      : [],
  },
  homeFeed: {
    kind: "subjects",
    items: [],
    nextCursor: "next-page",
    stopReason: null,
  },
  academicFeed: {
    items: [],
    nextCursor: null,
    stopReason: "end",
    context: { subjectIds: [] },
  },
  forYou: {
    items: [],
    nextCursor: null,
    stopReason: "end",
    effectiveSignals: {
      academic: true,
      social: true,
      interests: false,
      relationWindowTruncated: false,
    },
  },
  notifications: { unreadCount: 0 },
});

const item = (id: string, type: FeedItem["type"] = "resource"): FeedItem => ({
  id,
  type,
  title: `Title ${id}`,
  summary: "",
  author: { profileId: null, displayName: "Autor", avatarUrl: null },
  source: { kind: "personal_user" },
  academic: { subject: null },
  why: ["fresh"],
  createdAt: "2026-10-01T00:00:00.000Z",
});

const defaultPages: Pick<PilotHomeApi, "academicFeed" | "forYouFeed"> = {
  academicFeed: async () => home().academicFeed,
  forYouFeed: async () => home().forYou,
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test("does not attach previous-session academic state to a new Home authority", () => {
  assert.equal(
    academicContextBelongsToSession(
      "user-2:session-2",
      "user-1:session-1:context-3",
    ),
    false,
  );
  assert.equal(
    academicContextBelongsToSession(
      "user-1:session-1",
      "user-1:session-1:context-3",
    ),
    true,
  );
});

test("loads Home only when the server context matches the requested authority", async () => {
  const expected = home();
  const api: PilotHomeApi = {
    ...defaultPages,
    pilotHome: async () => expected,
  };
  const controller = new MobileHomeController(api);

  await controller.load("user-1:session-1:context-1", context());

  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "user-1:session-1:context-1",
    data: expected,
  });
  assert.equal(expected.homeFeed.nextCursor, "next-page");
});

test("requests context revalidation instead of committing a mismatched Home response", async () => {
  const api: PilotHomeApi = {
    ...defaultPages,
    pilotHome: async () => home(context("aff-b", "part-b")),
  };
  const controller = new MobileHomeController(api);

  await controller.load("user-1:session-1:context-1", context("aff-a"));

  assert.deepEqual(controller.getSnapshot(), {
    kind: "context_mismatch",
    authorityKey: "user-1:session-1:context-1",
  });
});

test("a late response from the previous context cannot replace the new Home", async () => {
  const first = deferred<PilotHomeResponse>();
  const second = deferred<PilotHomeResponse>();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const api: PilotHomeApi = {
    ...defaultPages,
    pilotHome: async (signal) => {
      signals.push(signal!);
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    },
  };
  const controller = new MobileHomeController(api);

  const oldLoad = controller.load("authority-a", context("aff-a"));
  const newLoad = controller.load("authority-b", context("aff-b", "part-b"));
  second.resolve(home(context("aff-b", "part-b")));
  await newLoad;
  first.resolve(home(context("aff-a")));
  await oldLoad;

  assert.equal(signals[0]?.aborted, true);
  const finalSnapshot = controller.getSnapshot();
  assert.equal(finalSnapshot.kind, "ready");
  if (finalSnapshot.kind === "ready") {
    assert.equal(
      finalSnapshot.data.academic.currentContext?.affiliationId,
      "aff-b",
    );
  }
});

test("invalidating the Home authority aborts and fences an in-flight request", async () => {
  const pending = deferred<PilotHomeResponse>();
  let signal: AbortSignal | undefined;
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async (requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
  });

  const load = controller.load("authority-a", context());
  controller.invalidate("authority-a");
  pending.resolve(home());
  await load;

  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("surfaces offline, timeout and service outages as distinct states", async (t) => {
  const cases = [
    ["offline", "offline"],
    ["timeout", "timeout"],
    ["server_unavailable", "server_unavailable"],
  ] as const;

  for (const [failureKind, expectedKind] of cases) {
    await t.test(failureKind, async () => {
      const controller = new MobileHomeController({
        pilotHome: async () => {
          throw new ApiRequestError(
            failureKind,
            null,
            failureKind.toUpperCase(),
            "request failed",
          );
        },
      });

      await controller.load("authority-a", context());

      assert.equal(controller.getSnapshot().kind, expectedKind);
    });
  }
});

test("Home continues academic cursor 6 with deduplication and no fabricated items", async () => {
  const initial = home();
  initial.homeFeed.items = [item("a"), item("b")];
  initial.homeFeed.nextCursor = "academic-page-2";
  initial.academicFeed.context.subjectIds = ["subject-a"];
  let calls = 0;
  let receivedSignal: AbortSignal | undefined;
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => initial,
    academicFeed: async (cursor, signal) => {
      calls += 1;
      assert.equal(cursor, "academic-page-2");
      receivedSignal = signal;
      return {
        items: [item("b"), item("c")],
        nextCursor: "academic-page-3",
        stopReason: null,
        context: { subjectIds: ["subject-a"] },
      };
    },
  });
  await controller.load("authority-a", context());
  await controller.loadMore("authority-a", "home");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(calls, 1);
  assert.equal(receivedSignal?.aborted, false);
  assert.deepEqual(
    snapshot.data.homeFeed.items.map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.equal(snapshot.data.homeFeed.nextCursor, "academic-page-3");
  assert.deepEqual(snapshot.pagination?.home, { loading: false, error: null });
});

test("Home alumni community cursor uses for-you community/ranked, not academic", async () => {
  const initial = home();
  initial.homeFeed.kind = "community";
  initial.homeFeed.nextCursor = "community-page-2";
  const modes: string[] = [];
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => initial,
    academicFeed: async () => {
      throw new Error("wrong API");
    },
    forYouFeed: async (cursor, mode) => {
      assert.equal(cursor, "community-page-2");
      modes.push(mode);
      return {
        ...initial.forYou,
        items: [item("community-post", "organization_post")],
        nextCursor: null,
      };
    },
  });
  await controller.load("authority-a", context());
  await controller.loadMore("authority-a", "home");
  assert.deepEqual(modes, ["community"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.homeFeed.items[0]?.type, "organization_post");
    assert.equal(snapshot.data.homeFeed.nextCursor, null);
  }
});

test("Home for-you feed paginates independently using balanced/ranked and type:id keys", async () => {
  const initial = home();
  initial.forYou.items = [item("same", "resource")];
  initial.forYou.nextCursor = "for-you-page-2";
  const modes: string[] = [];
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => initial,
    forYouFeed: async (cursor, mode) => {
      modes.push(mode);
      assert.equal(cursor, "for-you-page-2");
      return {
        ...initial.forYou,
        items: [item("same", "resource"), item("same", "question")],
        nextCursor: null,
        stopReason: "end",
      };
    },
  });
  await controller.load("authority-a", context());
  await controller.loadMore("authority-a", "for_you");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  assert.deepEqual(modes, ["balanced"]);
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.data.forYou.items.map((row) => [row.type, row.id]),
      [
        ["resource", "same"],
        ["question", "same"],
      ],
    );
    assert.equal(snapshot.data.homeFeed.nextCursor, "next-page");
  }
});

test("Home prevents duplicate same-feed page requests and preserves data on failure for retry", async () => {
  const pending = deferred<ReturnType<typeof home>["academicFeed"]>();
  let calls = 0;
  let shouldFail = true;
  const initial = home();
  initial.homeFeed.items = [item("old")];
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => initial,
    academicFeed: async () => {
      calls += 1;
      if (shouldFail) return pending.promise;
      return {
        ...initial.academicFeed,
        items: [item("new")],
        nextCursor: null,
      };
    },
  });
  await controller.load("authority-a", context());
  const first = controller.loadMore("authority-a", "home");
  await controller.loadMore("authority-a", "home");
  assert.equal(calls, 1);
  pending.reject(
    new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "offline"),
  );
  await first;
  let state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.deepEqual(
    state.data.homeFeed.items.map((row) => row.id),
    ["old"],
  );
  assert.match(state.pagination?.home?.error ?? "", /reintentar/);
  shouldFail = false;
  await controller.loadMore("authority-a", "home");
  state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") {
    assert.equal(calls, 2);
    assert.deepEqual(
      state.data.homeFeed.items.map((row) => row.id),
      ["old", "new"],
    );
    assert.equal(state.pagination?.home?.error, null);
  }
});

test("Home aborts stale page reads across sign-out/context invalidation", async () => {
  const pending = deferred<ReturnType<typeof home>["academicFeed"]>();
  let signal: AbortSignal | undefined;
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => home(),
    academicFeed: async (_cursor, requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
  });
  await controller.load("authority-a", context());
  const fetching = controller.loadMore("authority-a", "home");
  controller.invalidate("authority-a");
  pending.resolve({
    ...home().academicFeed,
    items: [item("stale")],
    nextCursor: null,
  });
  await fetching;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("Home refuses academic scope shifts, unchanged cursors and stale-authority triggers", async () => {
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => home(),
    academicFeed: async () => ({
      ...home().academicFeed,
      context: { subjectIds: ["unexpected"] },
      nextCursor: "other",
    }),
  });
  await controller.load("authority-a", context());
  await controller.loadMore("authority-b", "home");
  assert.equal(controller.getSnapshot().kind, "ready");
  await controller.loadMore("authority-a", "home");
  const state = controller.getSnapshot();
  if (state.kind === "ready") {
    assert.equal(state.data.homeFeed.nextCursor, "next-page");
    assert.match(state.pagination?.home?.error ?? "", /Actualizá Inicio/);
  }
  const repeated = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => home(),
    academicFeed: async () => ({
      ...home().academicFeed,
      nextCursor: "next-page",
    }),
  });
  await repeated.load("authority-a", context());
  await repeated.loadMore("authority-a", "home");
  const repeatedState = repeated.getSnapshot();
  assert.equal(repeatedState.kind, "ready");
  if (repeatedState.kind === "ready") {
    assert.match(repeatedState.pagination?.home?.error ?? "", /reintentar/);
  }
});

test("Home only reads whole cursor pages that fit the bounded memory budget", async () => {
  const initial = home();
  initial.homeFeed.items = Array.from(
    { length: MAX_HOME_FEED_ITEMS - HOME_FEED_PAGE_SIZE },
    (_, index) => item(`row-${index}`),
  );
  let calls = 0;
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => initial,
    academicFeed: async () => {
      calls += 1;
      return {
        ...initial.academicFeed,
        items: Array.from(
          { length: HOME_FEED_PAGE_SIZE },
          (_, index) => item(`new-${index}`),
        ),
        nextCursor: "more-pages",
      };
    },
  });
  await controller.load("authority-a", context());
  await controller.loadMore("authority-a", "home");
  await controller.loadMore("authority-a", "home");
  const state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") {
    assert.equal(state.data.homeFeed.items.length, MAX_HOME_FEED_ITEMS);
    assert.equal(state.data.homeFeed.items.at(-1)?.id, "new-5");
    assert.equal(state.data.homeFeed.nextCursor, "more-pages");
    assert.equal(canLoadMoreHomeFeed(state.data.homeFeed), false);
  }
  assert.equal(calls, 1);
});

test("Home never truncates a cursor page when fewer than six slots remain", async () => {
  const initial = home();
  initial.homeFeed.items = Array.from(
    { length: MAX_HOME_FEED_ITEMS - HOME_FEED_PAGE_SIZE + 1 },
    (_, index) => item(`row-${index}`),
  );
  let calls = 0;
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => initial,
    academicFeed: async () => {
      calls += 1;
      return {
        ...initial.academicFeed,
        items: Array.from(
          { length: HOME_FEED_PAGE_SIZE },
          (_, index) => item(`new-${index}`),
        ),
        nextCursor: "more-pages",
      };
    },
  });
  await controller.load("authority-a", context());
  await controller.loadMore("authority-a", "home");
  const state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") {
    assert.equal(state.data.homeFeed.items.length, MAX_HOME_FEED_ITEMS - HOME_FEED_PAGE_SIZE + 1);
    assert.equal(state.data.homeFeed.nextCursor, "next-page");
    assert.equal(canLoadMoreHomeFeed(state.data.homeFeed), false);
  }
  assert.equal(calls, 0);
});

test("Home refresh aborts an in-flight page and rejects its delayed result", async () => {
  const pending = deferred<ReturnType<typeof home>["academicFeed"]>();
  let pageSignal: AbortSignal | undefined;
  let snapshots = 0;
  const controller = new MobileHomeController({
    ...defaultPages,
    pilotHome: async () => {
      snapshots += 1;
      const response = home();
      response.homeFeed.items = [item(`fresh-${snapshots}`)];
      return response;
    },
    academicFeed: async (_cursor, signal) => {
      pageSignal = signal;
      return pending.promise;
    },
  });
  await controller.load("authority-a", context());
  const oldPage = controller.loadMore("authority-a", "home");
  await controller.load("authority-a", context());
  pending.resolve({
    ...home().academicFeed,
    nextCursor: null,
    items: [item("stale-page")],
  });
  await oldPage;
  assert.equal(pageSignal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.homeFeed.items.length, 1);
    assert.equal(snapshot.data.homeFeed.items[0]?.id, "fresh-2");
  }
});
