import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import {
  QaReceivedRepliesController,
  type QaReceivedRepliesSnapshot,
} from "../src/features/community/qa-received-replies-controller";
import type { QaReceivedRepliesApi } from "../src/features/community/qa-received-replies-runtime";
import type { QaReceivedReply } from "../src/features/community/qa-received-replies-api";

const reply: QaReceivedReply = {
  answerId: "9a73b180-ef29-4489-b7c5-000000000001",
  questionId: "a7f8eab6-42c8-4539-9fcd-8ce5d8794581",
  subjectId: "a2f47be6-e403-46ac-a913-90b778a92d8c",
  questionTitle: "¿Cómo preparo el final de Álgebra?",
  answeredAt: "2026-10-20T15:00:00.000Z",
  isAccepted: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("controller loads an owner page and appends cursor pages once", async () => {
  const calls: Array<string | undefined> = [];
  const api: QaReceivedRepliesApi = {
    list: async (cursor) => {
      calls.push(cursor);
      return cursor
        ? {
            items: [
              { ...reply, answerId: "9a73b180-ef29-4489-b7c5-000000000002" },
            ],
            nextCursor: null,
          }
        : { items: [reply], nextCursor: "first-next" };
    },
  };
  const controller = new QaReceivedRepliesController(api);

  await controller.load("owner:session-a");
  await controller.loadMore("owner:session-a");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(calls, [undefined, "first-next"]);
  assert.deepEqual(
    snapshot.page.items.map((item) => item.answerId),
    [reply.answerId, "9a73b180-ef29-4489-b7c5-000000000002"],
  );
  assert.equal(snapshot.page.nextCursor, null);
});

test("controller aborts and fences pages when account authority changes", async () => {
  const pending = deferred<{
    items: QaReceivedReply[];
    nextCursor: string | null;
  }>();
  let requestSignal: AbortSignal | undefined;
  const api: QaReceivedRepliesApi = {
    list: (_cursor, signal) => {
      requestSignal = signal;
      return pending.promise;
    },
  };
  const controller = new QaReceivedRepliesController(api);
  const firstLoad = controller.load("owner:session-a");

  controller.invalidate("owner:session-a");
  pending.resolve({ items: [reply], nextCursor: null });
  await firstLoad;

  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("controller stops repeated cursors and offers a safe restart for expiry", async () => {
  const api: QaReceivedRepliesApi = {
    list: async (cursor) => {
      if (cursor === "loop") return { items: [], nextCursor: "loop" };
      throw new ApiRequestError(
        "validation",
        422,
        "QA_RECEIVED_REPLIES_CURSOR_INVALID",
        "cursor expired",
      );
    },
  };
  const controller = new QaReceivedRepliesController(api);

  await controller.load("owner:session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "error");
  if (snapshot.kind !== "error") return;
  assert.equal(snapshot.failure.restartable, true);

  const loopApi = new QaReceivedRepliesController({
    list: async (cursor) =>
      cursor
        ? { items: [], nextCursor: "loop" }
        : { items: [reply], nextCursor: "loop" },
  });
  await loopApi.load("owner:session-a");
  await loopApi.loadMore("owner:session-a");
  snapshot = loopApi.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.page.nextCursor, "loop");
    assert.equal(
      snapshot.failure?.message,
      "No pudimos validar las respuestas recibidas.",
    );
  }
});

test("a failed page keeps its cursor available for a network retry", async () => {
  let pageRequests = 0;
  const controller = new QaReceivedRepliesController({
    list: async (cursor) => {
      if (!cursor) return { items: [reply], nextCursor: "retryable" };
      pageRequests += 1;
      if (pageRequests === 1) {
        throw new ApiRequestError("offline", null, null, "network unavailable");
      }
      return { items: [], nextCursor: null };
    },
  });

  await controller.load("owner:session-a");
  await controller.loadMore("owner:session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready")
    assert.equal(snapshot.failure?.retryable, true);

  await controller.loadMore("owner:session-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.page.nextCursor, null);
    assert.equal(snapshot.failure, null);
  }
  assert.equal(pageRequests, 2);
});

test("controller keeps results scoped to the request authority", async () => {
  const first = deferred<{
    items: QaReceivedReply[];
    nextCursor: string | null;
  }>();
  let calls = 0;
  const api: QaReceivedRepliesApi = {
    list: () => {
      calls += 1;
      return calls === 1
        ? first.promise
        : Promise.resolve({ items: [], nextCursor: null });
    },
  };
  const controller = new QaReceivedRepliesController(api);
  const observed: QaReceivedRepliesSnapshot[] = [];
  controller.subscribe((snapshot) => observed.push(snapshot));
  const firstLoad = controller.load("owner:session-a");
  await controller.load("owner:session-b");
  first.resolve({ items: [reply], nextCursor: null });
  await firstLoad;

  assert.equal(controller.getSnapshot().kind, "ready");
  assert.ok(
    observed.every(
      (snapshot) =>
        snapshot.kind !== "ready" ||
        snapshot.authorityKey === "owner:session-b",
    ),
  );
});
