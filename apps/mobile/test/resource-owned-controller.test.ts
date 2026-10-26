import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import { MobileOwnedResourcesController } from "../src/features/resources/resource-owned-controller";
import type { OwnedResourcesApi } from "../src/features/resources/resource-owned-api";
import { ApiRequestError } from "../src/services/api/client";

function resource(
  id: string,
  visibility: ResourceView["visibility"] = "private",
): ResourceView {
  return {
    id,
    title: `Apunte ${id}`,
    description: null,
    tags: ["facultad"],
    visibility,
    revision: 1,
    author: null,
    academic: {
      subject: { id: "subject", name: "Álgebra" },
      courseOffering: null,
    },
    file: {
      id: "file",
      filename: "apunte.pdf",
      mimeType: "application/pdf",
      byteSize: 100,
    },
    capabilities: { edit: true, manageShares: true },
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("first page includes own private resources without a search query", async () => {
  const calls: unknown[] = [];
  const controller = new MobileOwnedResourcesController({
    listOwned: async (query) => {
      calls.push(query);
      return { items: [resource("mine-1")], nextCursor: null };
    },
  });
  await controller.load("session-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.data.items[0]?.visibility, "private");
  assert.equal(snapshot.failure, null);
  assert.deepEqual(calls, [{}]);
});

test("loading more retains chronological order and deduplicates overlapping pages", async () => {
  const calls: unknown[] = [];
  const api: OwnedResourcesApi = {
    listOwned: async (query) => {
      calls.push(query);
      return query.cursor
        ? {
            items: [resource("second"), resource("third")],
            nextCursor: null,
          }
        : {
            items: [resource("first"), resource("second")],
            nextCursor: "page-2",
          };
    },
  };
  const controller = new MobileOwnedResourcesController(api);
  await controller.load("session-a", "shared");
  await controller.loadMore("session-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["first", "second", "third"],
  );
  assert.deepEqual(calls, [
    { visibility: "shared" },
    { visibility: "shared", cursor: "page-2" },
  ]);
});

test("owned resource pagination stops cursor cycles and resets on a new load", async () => {
  const cursors: Array<string | undefined> = [];
  const controller = new MobileOwnedResourcesController({
    listOwned: async (query) => {
      cursors.push(query.cursor);
      if (!query.cursor) {
        return { items: [resource("first")], nextCursor: "cursor-a" };
      }
      if (query.cursor === "cursor-a") {
        return { items: [resource("second")], nextCursor: "cursor-b" };
      }
      return { items: [resource("third")], nextCursor: "cursor-a" };
    },
  });

  await controller.load("session-a", "shared", { q: "parcial" });
  await controller.loadMore("session-a");
  await controller.loadMore("session-a");
  await controller.loadMore("session-a");

  let snapshot = controller.getSnapshot();
  assert.deepEqual(cursors, [undefined, "cursor-a", "cursor-b"]);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.data.items.map((item) => item.id),
      ["first", "second", "third"],
    );
    assert.equal(snapshot.data.nextCursor, null);
    assert.equal(snapshot.cursorRepeated, true);
  }

  await controller.load("session-a", "shared", { q: "parcial" });
  await controller.loadMore("session-a");
  snapshot = controller.getSnapshot();
  assert.deepEqual(cursors, [
    undefined,
    "cursor-a",
    "cursor-b",
    undefined,
    "cursor-a",
  ]);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.nextCursor, "cursor-b");
    assert.equal(snapshot.cursorRepeated, false);
  }
});

test("switching visibility aborts prior page and keeps filters isolated", async () => {
  const prior = deferred<{
    items: ResourceView[];
    nextCursor: string | null;
  }>();
  let canceled: AbortSignal | undefined;
  const controller = new MobileOwnedResourcesController({
    listOwned: async (query, signal) => {
      if (query.visibility === "private") {
        canceled = signal;
        return prior.promise;
      }
      return { items: [resource("public-1", "public")], nextCursor: null };
    },
  });

  const loading = controller.load("session-a", "private");
  await controller.load("session-a", "public");
  prior.resolve({ items: [resource("private-1")], nextCursor: null });
  await loading;
  assert.equal(canceled?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.visibility, "public");
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["public-1"],
  );
});

test("a previous session's late response cannot disclose owned resources", async () => {
  const previous = deferred<{
    items: ResourceView[];
    nextCursor: string | null;
  }>();
  const controller = new MobileOwnedResourcesController({
    listOwned: async () => previous.promise,
  });
  const pending = controller.load("user-a");
  controller.invalidate("user-a");
  previous.resolve({
    items: [resource("secret-from-a")],
    nextCursor: null,
  });
  await pending;
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("suspending the app aborts requests and discards cached publications", async () => {
  const pending = deferred<{
    items: ResourceView[];
    nextCursor: string | null;
  }>();
  let signal: AbortSignal | undefined;
  const controller = new MobileOwnedResourcesController({
    listOwned: async (_query, passedSignal) => {
      signal = passedSignal;
      return pending.promise;
    },
  });
  const operation = controller.load("session-a");
  controller.suspend("session-a");
  pending.resolve({ items: [resource("old")], nextCursor: null });
  await operation;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("loadMore ignores duplicate taps while the next page is pending", async () => {
  const later = deferred<{
    items: ResourceView[];
    nextCursor: string | null;
  }>();
  let calls = 0;
  const controller = new MobileOwnedResourcesController({
    listOwned: async (query) => {
      calls += 1;
      if (query.cursor) return later.promise;
      return { items: [resource("first")], nextCursor: "more" };
    },
  });
  await controller.load("session-a");
  const one = controller.loadMore("session-a");
  await controller.loadMore("session-a");
  later.resolve({ items: [resource("second")], nextCursor: null });
  await one;
  assert.equal(calls, 2);
});

test("a failed extra page keeps already-loaded resources and supports retry", async () => {
  let fail = true;
  const controller = new MobileOwnedResourcesController({
    listOwned: async (query) => {
      if (!query.cursor)
        return { items: [resource("first")], nextCursor: "next" };
      if (fail) {
        fail = false;
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "Offline",
        );
      }
      return { items: [resource("second")], nextCursor: null };
    },
  });
  await controller.load("session-a");
  await controller.loadMore("session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.failure, "offline");
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["first"],
  );
  await controller.loadMore("session-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["first", "second"],
  );
  assert.equal(snapshot.failure, null);
});

test("server-side search subject and oldest order persist across pagination", async () => {
  const calls: unknown[] = [];
  const controller = new MobileOwnedResourcesController({
    listOwned: async (input) => {
      calls.push(input);
      return input.cursor
        ? { items: [resource("older")], nextCursor: null }
        : { items: [resource("newer")], nextCursor: "opaque-page-2" };
    },
  });
  await controller.load("account", "shared", {
    q: "  ÁLGEBRA   parcial  ",
    subjectId: "subject-a",
    order: "oldest",
  });
  await controller.loadMore("account");
  assert.deepEqual(calls, [
    {
      visibility: "shared",
      q: "álgebra parcial",
      subjectId: "subject-a",
      order: "oldest",
    },
    {
      visibility: "shared",
      q: "álgebra parcial",
      subjectId: "subject-a",
      order: "oldest",
      cursor: "opaque-page-2",
    },
  ]);
  const snap = controller.getSnapshot();
  assert.equal(snap.kind, "ready");
  if (snap.kind !== "ready") return;
  assert.deepEqual(
    snap.data.items.map((row) => row.id),
    ["newer", "older"],
  );
});

test("changing only subject or query aborts earlier results with same visibility", async () => {
  const waiting = deferred<{
    items: ResourceView[];
    nextCursor: string | null;
  }>();
  let firstSignal: AbortSignal | undefined;
  const controller = new MobileOwnedResourcesController({
    listOwned: async (input, signal) => {
      if (input.subjectId === "subject-a") {
        firstSignal = signal;
        return waiting.promise;
      }
      return { items: [resource("other")], nextCursor: null };
    },
  });
  const earlier = controller.load("account", null, {
    q: "parcial",
    subjectId: "subject-a",
  });
  await controller.load("account", null, {
    q: "final",
    subjectId: "subject-b",
  });
  waiting.resolve({ items: [resource("stale")], nextCursor: null });
  await earlier;
  assert.equal(firstSignal?.aborted, true);
  const snap = controller.getSnapshot();
  assert.equal(snap.kind, "ready");
  if (snap.kind !== "ready") return;
  assert.equal(snap.filters.q, "final");
  assert.equal(snap.filters.subjectId, "subject-b");
  assert.deepEqual(
    snap.data.items.map((row) => row.id),
    ["other"],
  );
});

test("changing chronological direction clears earlier pagination", async () => {
  const controller = new MobileOwnedResourcesController({
    listOwned: async (query) =>
      query.order === "oldest"
        ? { items: [resource("old")], nextCursor: null }
        : { items: [resource("new")], nextCursor: "page-next" },
  });
  await controller.load("account");
  await controller.load("account", null, { order: "oldest" });
  await controller.loadMore("account");
  const snap = controller.getSnapshot();
  assert.equal(snap.kind, "ready");
  if (snap.kind !== "ready") return;
  assert.equal(snap.filters.order, "oldest");
  assert.equal(snap.data.nextCursor, null);
  assert.deepEqual(
    snap.data.items.map((row) => row.id),
    ["old"],
  );
});
