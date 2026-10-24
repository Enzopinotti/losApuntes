import assert from "node:assert/strict";
import test from "node:test";

import type { AcademicCatalogNode } from "@losapuntes/contracts";
import {
  AcademicFollowsController,
  type AcademicFollowsApi,
} from "../src/features/academic/academic-follows-controller";

const institutionId = "bbde8519-5796-429c-b078-7b705edc5a0b";
const programId = "269f2da7-f70c-418d-9151-000000000001";
const institution: AcademicCatalogNode = {
  id: institutionId,
  kind: "institution",
  name: "Universidad Nacional",
  parentIds: [],
  status: "active",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("search results from a superseded account are aborted and ignored", async () => {
  const previous = deferred<{
    items: AcademicCatalogNode[];
    nextCursor: string | null;
  }>();
  let firstSignal: AbortSignal | undefined;
  const api: AcademicFollowsApi = {
    list: async () => ({ follows: [], truncated: false, limit: 100 }),
    search: async (_kind, query, _cursor, signal) => {
      if (query === "old") {
        firstSignal = signal;
        return previous.promise;
      }
      return { items: [institution], nextCursor: null };
    },
    follow: async () => ({ following: true }),
    unfollow: async () => undefined,
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user-a:session-a");
  const oldSearch = controller.search("user-a:session-a", "institution", "old");
  controller.setAuthority("user-b:session-b");
  await controller.search("user-b:session-b", "institution", "new");
  previous.resolve({
    items: [{ ...institution, id: programId }],
    nextCursor: null,
  });
  await oldSearch;

  assert.equal(firstSignal?.aborted, true);
  assert.equal(controller.getSnapshot().authorityKey, "user-b:session-b");
  assert.deepEqual(controller.getSnapshot().results, [institution]);
});

test("following a catalog entry refreshes the owner list before clearing pending state", async () => {
  const calls: string[] = [];
  let following = false;
  const api: AcademicFollowsApi = {
    list: async () => {
      calls.push("list");
      return {
        follows: following
          ? [
              {
                targetId: institutionId,
                kind: "institution",
                name: "Universidad Nacional",
              },
            ]
          : [],
        truncated: false,
        limit: 100,
      };
    },
    search: async () => ({ items: [], nextCursor: null }),
    follow: async (nodeId) => {
      calls.push(`follow:${nodeId}`);
      following = true;
      return { following: true };
    },
    unfollow: async (nodeId) => {
      calls.push(`unfollow:${nodeId}`);
      following = false;
    },
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user:session");
  await controller.load("user:session");
  await controller.toggleFollow("user:session", institution);

  assert.deepEqual(calls, ["list", `follow:${institutionId}`, "list"]);
  assert.equal(controller.getSnapshot().follows[0]?.targetId, institutionId);
  assert.deepEqual(controller.getSnapshot().pendingTargetIds, []);
});

test("catalog paging appends entries once and keeps the current query", async () => {
  const api: AcademicFollowsApi = {
    list: async () => ({ follows: [], truncated: false, limit: 100 }),
    search: async (_kind, _query, cursor) =>
      cursor
        ? { items: [institution], nextCursor: null }
        : { items: [institution], nextCursor: "next" },
    follow: async () => ({ following: true }),
    unfollow: async () => undefined,
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user:session");
  await controller.search("user:session", "institution", "Nacional");
  await controller.loadMore("user:session");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.searchPhase, "ready");
  assert.equal(snapshot.query, "Nacional");
  assert.equal(snapshot.results.length, 1);
  assert.equal(snapshot.nextCursor, null);
});

test("catalog paging stops repeated cursors and preserves loaded options", async () => {
  const cursors: Array<string | undefined> = [];
  const api: AcademicFollowsApi = {
    list: async () => ({ follows: [], truncated: false, limit: 100 }),
    search: async (_kind, _query, cursor) => {
      cursors.push(cursor);
      return cursor
        ? { items: [institution], nextCursor: cursor }
        : { items: [institution], nextCursor: "cursor-a" };
    },
    follow: async () => ({ following: true }),
    unfollow: async () => undefined,
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user:session");
  await controller.search("user:session", "institution", "Nacional");
  await controller.loadMore("user:session");

  const snapshot = controller.getSnapshot();
  assert.deepEqual(cursors, [undefined, "cursor-a"]);
  assert.deepEqual(snapshot.results, [institution]);
  assert.equal(snapshot.nextCursor, null);
  assert.equal(snapshot.searchCursorRepeated, true);
  assert.equal(snapshot.loadingMore, false);
});

test("catalog paging stops a cycle back to an earlier page cursor", async () => {
  const cursors: Array<string | undefined> = [];
  const api: AcademicFollowsApi = {
    list: async () => ({ follows: [], truncated: false, limit: 100 }),
    search: async (_kind, _query, cursor) => {
      cursors.push(cursor);
      if (!cursor) return { items: [institution], nextCursor: "cursor-a" };
      if (cursor === "cursor-a")
        return { items: [institution], nextCursor: "cursor-b" };
      return { items: [institution], nextCursor: "cursor-a" };
    },
    follow: async () => ({ following: true }),
    unfollow: async () => undefined,
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user:session");
  await controller.search("user:session", "institution", "Nacional");
  await controller.loadMore("user:session");
  await controller.loadMore("user:session");

  const snapshot = controller.getSnapshot();
  assert.deepEqual(cursors, [undefined, "cursor-a", "cursor-b"]);
  assert.equal(snapshot.results.length, 1);
  assert.equal(snapshot.nextCursor, null);
  assert.equal(snapshot.searchCursorRepeated, true);
});

test("a failed catalog page can retry without consuming its cursor", async () => {
  const cursors: Array<string | undefined> = [];
  let failNextPage = true;
  const api: AcademicFollowsApi = {
    list: async () => ({ follows: [], truncated: false, limit: 100 }),
    search: async (_kind, _query, cursor) => {
      cursors.push(cursor);
      if (!cursor) return { items: [institution], nextCursor: "cursor-a" };
      if (failNextPage) {
        failNextPage = false;
        throw new Error("temporary network failure");
      }
      return { items: [institution], nextCursor: null };
    },
    follow: async () => ({ following: true }),
    unfollow: async () => undefined,
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user:session");
  await controller.search("user:session", "institution", "Nacional");
  await controller.loadMore("user:session");
  assert.equal(controller.getSnapshot().nextCursor, "cursor-a");

  await controller.loadMore("user:session");

  assert.deepEqual(cursors, [undefined, "cursor-a", "cursor-a"]);
  assert.equal(controller.getSnapshot().nextCursor, null);
  assert.equal(controller.getSnapshot().searchCursorRepeated, false);
});

test("a new catalog query resets cursor history", async () => {
  const cursors: Array<string | undefined> = [];
  const api: AcademicFollowsApi = {
    list: async () => ({ follows: [], truncated: false, limit: 100 }),
    search: async (_kind, query, cursor) => {
      cursors.push(cursor);
      return query === "Nueva" && cursor
        ? { items: [institution], nextCursor: null }
        : { items: [institution], nextCursor: "cursor-a" };
    },
    follow: async () => ({ following: true }),
    unfollow: async () => undefined,
  };
  const controller = new AcademicFollowsController(api);
  controller.setAuthority("user:session");
  await controller.search("user:session", "institution", "Anterior");
  await controller.loadMore("user:session");
  assert.equal(controller.getSnapshot().searchCursorRepeated, true);

  await controller.search("user:session", "institution", "Nueva");
  await controller.loadMore("user:session");

  assert.deepEqual(cursors, [undefined, "cursor-a", undefined, "cursor-a"]);
  assert.equal(controller.getSnapshot().searchCursorRepeated, false);
  assert.equal(controller.getSnapshot().nextCursor, null);
});
