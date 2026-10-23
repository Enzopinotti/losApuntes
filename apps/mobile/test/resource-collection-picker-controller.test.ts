import assert from "node:assert/strict";
import test from "node:test";

import type { StudyCollection } from "../src/features/study-collections/study-collections-api";
import {
  ResourceCollectionPickerController,
  type ResourceCollectionPickerApi,
} from "../src/features/study-collections/resource-collection-picker-controller";

function collection(
  id: string,
  changes: Partial<StudyCollection> = {},
): StudyCollection {
  return {
    id,
    title: `Colección ${id}`,
    description: null,
    resourceCount: 0,
    revision: 1,
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
    ...changes,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<ResourceCollectionPickerApi> = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const api: ResourceCollectionPickerApi = {
    list: async (cursor, signal) => {
      calls.push({ name: "list", args: [cursor, signal] });
      return { items: [collection("one")], nextCursor: null };
    },
    add: async (collectionId, resourceId, signal) => {
      calls.push({ name: "add", args: [collectionId, resourceId, signal] });
      return {
        collection: collection(collectionId, {
          resourceCount: 1,
          revision: 2,
        }),
      };
    },
    ...overrides,
  };
  return {
    controller: new ResourceCollectionPickerController(api),
    calls,
  };
}

test("opening loads only the first bounded collection page for this resource scope", async () => {
  const { controller, calls } = setup();
  await controller.open("user:session", "resource-1");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["list"],
  );
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "user:session",
    resourceId: "resource-1",
    items: [collection("one")],
    nextCursor: null,
    loadingMore: false,
    busyCollectionId: null,
    savedCollectionIds: [],
    error: null,
    notice: null,
  });
});

test("opening another result fences the earlier collection response", async () => {
  const first = deferred<{
    items: StudyCollection[];
    nextCursor: string | null;
  }>();
  const second = deferred<{
    items: StudyCollection[];
    nextCursor: string | null;
  }>();
  let calls = 0;
  const { controller } = setup({
    list: async () => {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    },
  });

  const openingFirst = controller.open("user:session", "resource-first");
  const openingSecond = controller.open("user:session", "resource-second");
  second.resolve({ items: [collection("second")], nextCursor: null });
  await openingSecond;
  first.resolve({ items: [collection("first")], nextCursor: null });
  await openingFirst;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.resourceId, "resource-second");
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["second"],
    );
  }
});

test("pagination preserves the opaque cursor and deduplicates collection IDs", async () => {
  const { controller, calls } = setup({
    list: async (cursor, signal) => {
      calls.push({ name: "list", args: [cursor, signal] });
      return cursor
        ? {
            items: [
              collection("one", { title: "Actualizada" }),
              collection("two"),
            ],
            nextCursor: null,
          }
        : { items: [collection("one")], nextCursor: "opaque/page" };
    },
  });
  await controller.open("user:session", "resource-1");
  await controller.loadMore();
  assert.deepEqual(
    calls.map((call) => call.args[0]),
    [undefined, "opaque/page"],
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["one", "two"],
    );
    assert.equal(snapshot.items[0]?.title, "Actualizada");
    assert.equal(snapshot.nextCursor, null);
  }
});

test("saving uses the selected collection and updates its server-confirmed count", async () => {
  const { controller, calls } = setup();
  await controller.open("user:session", "resource-1");
  await controller.save("one");
  assert.equal(calls.at(-1)?.name, "add");
  assert.deepEqual(calls.at(-1)?.args.slice(0, 2), ["one", "resource-1"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.items[0]?.resourceCount, 1);
    assert.equal(snapshot.items[0]?.revision, 2);
    assert.equal(snapshot.notice, "Apunte agregado a “Colección one”.");
    assert.equal(snapshot.busyCollectionId, null);
    assert.deepEqual(snapshot.savedCollectionIds, ["one"]);
  }
});

test("closing while a collection load is pending fences the late response", async () => {
  const pending = deferred<{
    items: StudyCollection[];
    nextCursor: string | null;
  }>();
  const { controller } = setup({ list: async () => pending.promise });
  const opening = controller.open("user:session", "resource-1");
  controller.close();
  pending.resolve({ items: [collection("late")], nextCursor: null });
  await opening;
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("resource or session closure prevents a late add from repainting another scope", async () => {
  const pending = deferred<{ collection: StudyCollection }>();
  const { controller } = setup({ add: async () => pending.promise });
  await controller.open("user:session", "resource-1");
  const saving = controller.save("one");
  controller.close();
  pending.resolve({ collection: collection("one", { resourceCount: 1 }) });
  await saving;
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("a failed add stays retryable and preserves the loaded collections", async () => {
  let attempts = 0;
  const { controller } = setup({
    add: async (collectionId) => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return { collection: collection(collectionId, { resourceCount: 1 }) };
    },
  });
  await controller.open("user:session", "resource-1");
  await controller.save("one");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.items.length, 1);
    assert.match(snapshot.error ?? "", /No pudimos completar/u);
  }
  await controller.save("one");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.error, null);
    assert.equal(snapshot.items[0]?.resourceCount, 1);
    assert.deepEqual(snapshot.savedCollectionIds, ["one"]);
  }
});

test("unknown collection IDs never trigger a mutation", async () => {
  const { controller, calls } = setup();
  await controller.open("user:session", "resource-1");
  await controller.save("other");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["list"],
  );
});
