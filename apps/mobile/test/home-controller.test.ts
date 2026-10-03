import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcademicCurrentContext,
  PilotHomeResponse,
} from "@losapuntes/contracts";

import {
  academicContextBelongsToSession,
  MobileHomeController,
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
  const api: PilotHomeApi = { pilotHome: async () => expected };
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
