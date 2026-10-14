import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import type {
  ResourceConsumptionApi,
  ResourceSavedPage,
} from "../src/features/resources/resource-consumption-api";
import { MobileSavedResourcesController } from "../src/features/resources/resource-consumption-controller";
import { MobileSavedSubjectFacetsController } from "../src/features/resources/saved-subject-facets";
import { ApiRequestError } from "../src/services/api/client";

function resource(id: string, revision = 1): ResourceView {
  return {
    id,
    title: `Apunte ${id}`,
    description: null,
    tags: [],
    visibility: "public",
    author: null,
    academic: {
      subject: { id: "11111111-1111-4111-8111-111111111111", name: "Álgebra" },
      courseOffering: null,
    },
    file: {
      id,
      filename: `${id}.pdf`,
      mimeType: "application/pdf",
      byteSize: 512,
    },
    capabilities: { edit: false, manageShares: false },
    revision,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

test("foreground sync checks the first page without resetting already-loaded pages if unchanged", async () => {
  const calls: Array<{
    cursor?: string;
    q?: string;
    subject?: string;
    order?: string;
  }> = [];
  const subjectId = "11111111-1111-4111-8111-111111111111";
  const api = {
    saved: async (
      cursor?: string,
      _signal?: AbortSignal,
      q?: string,
      subject?: string,
      order?: string,
    ): Promise<ResourceSavedPage> => {
      calls.push({ cursor, q, subject, order });
      if (cursor) return { items: [resource("third")], nextCursor: null };
      return {
        items: [resource("first"), resource("second")],
        nextCursor: "after-second",
      };
    },
  } as ResourceConsumptionApi;

  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-1", "resumen", subjectId, "title");
  await controller.loadMore("account-1");
  await controller.sync("account-1");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.data.items.map((item) => item.id),
    ["first", "second", "third"],
  );
  assert.equal(snapshot.data.nextCursor, null);
  assert.equal(snapshot.syncing, false);
  assert.equal(snapshot.syncNotice, null);
  assert.equal(snapshot.syncFailure, null);
  assert.deepEqual(
    calls.map((call) => call.cursor),
    [undefined, "after-second", undefined],
  );
  assert.equal(calls[2]?.q, "resumen");
  assert.equal(calls[2]?.subject, subjectId);
  assert.equal(calls[2]?.order, "title");
});

test("cross-device changes reset continuation pages but preserve chosen query and ordering", async () => {
  let firstPageCount = 0;
  const calls: Array<string | undefined> = [];
  const api = {
    saved: async (cursor?: string): Promise<ResourceSavedPage> => {
      calls.push(cursor);
      if (cursor)
        return { items: [resource("older")], nextCursor: "page-three" };
      firstPageCount += 1;
      return firstPageCount === 1
        ? { items: [resource("original")], nextCursor: "page-two" }
        : {
            items: [resource("new-from-other-device"), resource("original")],
            nextCursor: "new-page-two",
          };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-1", "resumen", undefined, "title");
  await controller.loadMore("account-1");
  await controller.sync("account-1");
  const state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.deepEqual(
    state.data.items.map((item) => item.id),
    ["new-from-other-device", "original"],
  );
  assert.equal(state.data.nextCursor, "new-page-two");
  assert.equal(state.syncNotice, "updated");
  assert.equal(state.paginationStalled, false);
  assert.equal(state.syncFailure, null);
  await controller.loadMore("account-1");
  assert.deepEqual(calls, [undefined, "page-two", undefined, "new-page-two"]);
});

test("same ID with a changed revision is considered an update", async () => {
  let count = 0;
  const api = {
    saved: async (): Promise<ResourceSavedPage> => {
      count++;
      return { items: [resource("same", count)], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-a");
  await controller.sync("account-a");
  const ready = controller.getSnapshot();
  assert.equal(ready.kind, "ready");
  if (ready.kind === "ready") {
    assert.equal(ready.data.items[0]?.revision, 2);
    assert.equal(ready.syncNotice, "updated");
  }
});

test("failed silent checks do not erase pages or invalidate their saved cursor", async () => {
  let calls = 0;
  const api = {
    saved: async (): Promise<ResourceSavedPage> => {
      calls++;
      if (calls === 1)
        return { items: [resource("visible")], nextCursor: "second-page" };
      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "Offline",
      );
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-a");
  await controller.sync("account-a");
  const state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.deepEqual(
    state.data.items.map((item) => item.id),
    ["visible"],
  );
  assert.equal(state.data.nextCursor, "second-page");
  assert.equal(state.syncFailure, "offline");
  assert.equal(state.syncNotice, null);
});

test("in-flight sync is cancelled by session changes; stale results never cross accounts", async () => {
  const pending = deferred<ResourceSavedPage>();
  let count = 0;
  let syncSignal: AbortSignal | undefined;
  const api = {
    saved: async (
      _cursor?: string,
      signal?: AbortSignal,
    ): Promise<ResourceSavedPage> => {
      count++;
      if (count === 1)
        return { items: [resource("account-a")], nextCursor: null };
      if (count === 2) {
        syncSignal = signal;
        return pending.promise;
      }
      return { items: [resource("account-b")], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-a");
  const syncing = controller.sync("account-a");
  await controller.load("account-b");
  pending.resolve({
    items: [resource("leaked-old-account")],
    nextCursor: null,
  });
  await syncing;
  assert.equal(syncSignal?.aborted, true);
  const state = controller.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.equal(state.authorityKey, "account-b");
  assert.deepEqual(
    state.data.items.map((item) => item.id),
    ["account-b"],
  );
});

test("active removal and loading more cannot race with silent refresh", async () => {
  const removing = deferred<void>();
  let saves = 0;
  const api = {
    saved: async (): Promise<ResourceSavedPage> => {
      saves++;
      return { items: [resource("item")], nextCursor: null };
    },
    unsave: async () => removing.promise,
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("owner");
  const removal = controller.removeSaved("owner", "item");
  await controller.sync("owner");
  assert.equal(saves, 1);
  removing.resolve();
  await removal;
  await controller.sync("owner");
  assert.equal(saves, 2);
});

test("subject facets refresh without hiding chips and report failed checks", async () => {
  let calls = 0;
  const pending = deferred<{
    items: Array<{ subjectId: string; name: string; count: number }>;
    truncated: boolean;
  }>();
  const controller = new MobileSavedSubjectFacetsController({
    subjects: async () => {
      calls++;
      if (calls === 1)
        return {
          items: [{ subjectId: "subject", name: "Matemática", count: 2 }],
          truncated: false,
        };
      if (calls === 2) return pending.promise;
      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "Offline",
      );
    },
  });
  await controller.load("account-1");
  const sync = controller.sync("account-1");
  const during = controller.getSnapshot();
  assert.equal(during.kind, "ready");
  if (during.kind === "ready") {
    assert.equal(during.refreshing, true);
    assert.equal(during.data.items[0]?.count, 2);
  }
  pending.resolve({
    items: [{ subjectId: "subject", name: "Matemática", count: 3 }],
    truncated: false,
  });
  await sync;
  const updated = controller.getSnapshot();
  assert.equal(updated.kind, "ready");
  if (updated.kind === "ready") assert.equal(updated.data.items[0]?.count, 3);
  await controller.sync("account-1");
  const failed = controller.getSnapshot();
  assert.equal(failed.kind, "ready");
  if (failed.kind === "ready") {
    assert.equal(failed.data.items[0]?.count, 3);
    assert.equal(failed.refreshFailure, "offline");
  }
});

test("foreground-only scheduler stops on lost focus or background and does not auto-page", () => {
  const screen = readFileSync(
    new URL(
      "../src/features/resources/saved-resources-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(screen, /SAVED_FOREGROUND_SYNC_INTERVAL_MS = 90_000/u);
  assert.match(
    screen,
    /const authorityKey = isFocused && appState === "active"/u,
  );
  assert.match(screen, /if \(!authorityKey \|\| !searchEligible\) return;/u);
  assert.match(screen, /setInterval\(\(\) => \{/u);
  assert.match(screen, /controller\.sync\(authorityKey\)/u);
  assert.match(screen, /subjectsController\.sync\(authorityKey\)/u);
  assert.match(screen, /clearInterval\(interval\)/u);
  assert.doesNotMatch(screen, /onEndReached=/u);
});

test("suspending an active check aborts it and clears the busy state", async () => {
  const pending = deferred<ResourceSavedPage>();
  let calls = 0;
  let signal: AbortSignal | undefined;
  const api = {
    saved: async (
      _cursor?: string,
      passedSignal?: AbortSignal,
    ): Promise<ResourceSavedPage> => {
      calls++;
      if (calls === 1)
        return { items: [resource("existing")], nextCursor: null };
      signal = passedSignal;
      return pending.promise;
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-a");
  const syncing = controller.sync("account-a");
  controller.suspend("account-a");
  pending.resolve({ items: [resource("outdated")], nextCursor: null });
  await syncing;
  const result = controller.getSnapshot();
  assert.equal(signal?.aborted, true);
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.syncing, false);
    assert.equal(result.syncNotice, null);
    assert.deepEqual(
      result.data.items.map((item) => item.id),
      ["existing"],
    );
  }
});

test("only a new sync-update notice triggers scrolling, not each pagination render", () => {
  const screen = readFileSync(
    new URL(
      "../src/features/resources/saved-resources-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(screen, /const syncNoticeForScroll =/u);
  assert.match(screen, /\[syncNoticeForScroll\]/u);
  assert.match(screen, /syncNoticeForScroll === "updated"/u);
  assert.doesNotMatch(screen, /\[snapshot\]\);\s*\n\s*const current/u);
});
