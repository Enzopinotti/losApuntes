import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import {
  QaNeedsHelpController,
  type QaNeedsHelpSnapshot,
} from "../src/features/community/qa-needs-help-controller";
import type { QaNeedsHelpApi } from "../src/features/community/qa-needs-help-runtime";
import type { QaNeedsHelpQuestion } from "../src/features/community/qa-needs-help-api";

const subjectId = "bbde8519-5796-429c-b078-7b705edc5a0b";
const firstQuestion: QaNeedsHelpQuestion = {
  questionId: "269f2da7-f70c-418d-9151-000000000001",
  subjectId,
  title: "Una pregunta anterior",
  createdAt: "2026-10-19T14:00:00.000Z",
};
const secondQuestion: QaNeedsHelpQuestion = {
  questionId: "269f2da7-f70c-418d-9151-000000000002",
  subjectId,
  title: "Una pregunta posterior",
  createdAt: "2026-10-20T14:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("controller appends oldest-first subject pages under one authority", async () => {
  const calls: Array<{ subjectId: string; cursor?: string }> = [];
  const api: QaNeedsHelpApi = {
    list: async (requestedSubjectId, cursor) => {
      calls.push(
        cursor
          ? { subjectId: requestedSubjectId, cursor }
          : { subjectId: requestedSubjectId },
      );
      return cursor
        ? { items: [secondQuestion], nextCursor: null }
        : { items: [firstQuestion], nextCursor: "first-next" };
    },
  };
  const controller = new QaNeedsHelpController(api);

  await controller.load("owner:context:subject", subjectId);
  await controller.loadMore("owner:context:subject", subjectId);

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(calls, [{ subjectId }, { subjectId, cursor: "first-next" }]);
  assert.deepEqual(snapshot.page.items, [firstQuestion, secondQuestion]);
  assert.equal(snapshot.page.nextCursor, null);
});

test("changing subject authority aborts and ignores the previous page", async () => {
  const previous = deferred<{
    items: QaNeedsHelpQuestion[];
    nextCursor: string | null;
  }>();
  let firstSignal: AbortSignal | undefined;
  let calls = 0;
  const api: QaNeedsHelpApi = {
    list: (_subjectId, _cursor, signal) => {
      calls += 1;
      if (calls === 1) {
        firstSignal = signal;
        return previous.promise;
      }
      return Promise.resolve({ items: [], nextCursor: null });
    },
  };
  const controller = new QaNeedsHelpController(api);
  const observed: QaNeedsHelpSnapshot[] = [];
  controller.subscribe((snapshot) => observed.push(snapshot));
  const firstLoad = controller.load("authority:subject-a", subjectId);
  await controller.load("authority:subject-b", subjectId);
  previous.resolve({ items: [firstQuestion], nextCursor: null });
  await firstLoad;

  assert.equal(firstSignal?.aborted, true);
  assert.equal(controller.getSnapshot().kind, "ready");
  assert.ok(
    observed.every(
      (snapshot) =>
        snapshot.kind !== "ready" ||
        snapshot.authorityKey === "authority:subject-b",
    ),
  );
});

test("cyclic and expired cursors stop pagination and offer a first-page restart", async () => {
  let calls = 0;
  const controller = new QaNeedsHelpController({
    list: async (_subjectId, cursor) => {
      calls += 1;
      if (!cursor) return { items: [firstQuestion], nextCursor: "loop" };
      return { items: [secondQuestion], nextCursor: "loop" };
    },
  });
  await controller.load("authority", subjectId);
  await controller.loadMore("authority", subjectId);
  await controller.loadMore("authority", subjectId);

  let snapshot = controller.getSnapshot();
  assert.equal(calls, 2);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.loadMoreFailure?.restartable, false);

  const expired = new QaNeedsHelpController({
    list: async (_subjectId, cursor) => {
      if (!cursor) return { items: [firstQuestion], nextCursor: "expired" };
      throw new ApiRequestError(
        "validation",
        422,
        "QA_NEEDS_HELP_CURSOR_INVALID",
        "cursor expired",
      );
    },
  });
  await expired.load("authority", subjectId);
  await expired.loadMore("authority", subjectId);
  snapshot = expired.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.loadMoreFailure?.restartable, true);
  }
});

test("a network error preserves the cursor so the same page can be retried", async () => {
  let pageRequests = 0;
  const controller = new QaNeedsHelpController({
    list: async (_subjectId, cursor) => {
      if (!cursor) return { items: [firstQuestion], nextCursor: "retry" };
      pageRequests += 1;
      if (pageRequests === 1) {
        throw new ApiRequestError("offline", null, null, "offline");
      }
      return { items: [secondQuestion], nextCursor: null };
    },
  });
  await controller.load("authority", subjectId);
  await controller.loadMore("authority", subjectId);
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.loadMoreFailure?.retryable, true);
  }

  await controller.loadMore("authority", subjectId);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.page.items.length, 2);
    assert.equal(snapshot.loadMoreFailure, null);
  }
  assert.equal(pageRequests, 2);
});
