import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import type {
  ResourceAccessResponse,
  ResourceConsumptionApi,
  ResourceSavedPage,
} from "../src/features/resources/resource-consumption-api";
import {
  MobileResourceDetailController,
  MobileSavedResourcesController,
  resourceConsumptionFailure,
} from "../src/features/resources/resource-consumption-controller";
import { ApiRequestError } from "../src/services/api/client";

const resource = (id: string): ResourceView => ({
  id,
  title: `Recurso ${id}`,
  description: null,
  tags: [],
  visibility: "private",
  author: null,
  academic: {
    subject: { id: "subject-1", name: "Álgebra" },
    courseOffering: null,
  },
  file: {
    id: `file-${id}`,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    byteSize: 12,
  },
  capabilities: { edit: false, manageShares: false },
  revision: 1,
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:00:00.000Z",
});

const access = (id: string): ResourceAccessResponse => ({
  resource: resource(id),
  file: resource(id).file,
  access: {
    url: `https://storage.example.invalid/${id}?signature=secret`,
    expiresAt: "2026-10-04T12:05:00.000Z",
  },
});

const apiStub = (
  overrides: Partial<ResourceConsumptionApi> = {},
): ResourceConsumptionApi => ({
  access: async (resourceId) => access(resourceId),
  save: async () => ({ saved: true }),
  unsave: async () => undefined,
  saved: async (): Promise<ResourceSavedPage> => ({
    items: [],
    nextCursor: null,
  }),
  ...overrides,
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

test("resource detail keeps save state scoped to the current resource authority", async () => {
  const calls: string[] = [];
  const controller = new MobileResourceDetailController(
    apiStub({
      save: async (id) => {
        calls.push(`save:${id}`);
        return { saved: true };
      },
      unsave: async (id) => {
        calls.push(`unsave:${id}`);
      },
    }),
  );

  controller.setScope("session-a:resource-1", "resource-1");
  await controller.save("session-a:resource-1", "resource-1");

  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "session-a:resource-1",
    resourceId: "resource-1",
    saved: true,
    busy: null,
    failure: null,
  });

  await controller.unsave("session-a:resource-1", "resource-1");

  assert.deepEqual(calls, ["save:resource-1", "unsave:resource-1"]);
  assert.equal(
    controller.getSnapshot().kind === "ready"
      ? controller.getSnapshot().saved
      : null,
    false,
  );
});

test("resource access result is discarded when authority changes in flight", async () => {
  const pending = deferred<ResourceAccessResponse>();
  let signal: AbortSignal | undefined;
  const controller = new MobileResourceDetailController(
    apiStub({
      access: async (_id, _disposition, nextSignal) => {
        signal = nextSignal;
        return pending.promise;
      },
    }),
  );

  controller.setScope("session-a:resource-1", "resource-1");
  const request = controller.access("session-a:resource-1", "resource-1");

  controller.setScope("session-b:resource-2", "resource-2");
  pending.resolve(access("resource-1"));

  assert.equal(await request, null);
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "session-b:resource-2",
    resourceId: "resource-2",
    saved: null,
    busy: null,
    failure: null,
  });
});

test("saved resources paginate with id dedupe and preserve server cursor", async () => {
  const calls: Array<string | undefined> = [];
  const controller = new MobileSavedResourcesController(
    apiStub({
      saved: async (cursor) => {
        calls.push(cursor);
        if (!cursor) {
          return {
            items: [resource("r1"), resource("r2")],
            nextCursor: "cursor-2",
          };
        }
        return {
          items: [resource("r2"), resource("r3")],
          nextCursor: null,
        };
      },
    }),
  );

  await controller.load("session-a");
  await controller.loadMore("session-a");

  assert.deepEqual(calls, [undefined, "cursor-2"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.data.items.map((item) => item.id),
      ["r1", "r2", "r3"],
    );
    assert.equal(snapshot.data.nextCursor, null);
    assert.equal(snapshot.loadingMore, false);
  }
});

test("saved resources ignore stale results after principal switch", async () => {
  const first = deferred<ResourceSavedPage>();
  const second = deferred<ResourceSavedPage>();
  let call = 0;
  const signals: AbortSignal[] = [];
  const controller = new MobileSavedResourcesController(
    apiStub({
      saved: async (_cursor, signal) => {
        call += 1;
        signals.push(signal!);
        return call === 1 ? first.promise : second.promise;
      },
    }),
  );

  const oldLoad = controller.load("session-a");
  const currentLoad = controller.load("session-b");

  second.resolve({ items: [resource("b")], nextCursor: null });
  await currentLoad;
  first.resolve({ items: [resource("a")], nextCursor: null });
  await oldLoad;

  assert.equal(signals[0]?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "session-b");
    assert.deepEqual(snapshot.data.items.map((item) => item.id), ["b"]);
  }
});

test("resource failures distinguish authorization, missing content, and network states", () => {
  assert.equal(
    resourceConsumptionFailure(
      new ApiRequestError("forbidden", 403, "RESOURCE_FORBIDDEN", "forbidden"),
    ),
    "forbidden",
  );
  assert.equal(
    resourceConsumptionFailure(
      new ApiRequestError("unexpected", 404, "RESOURCE_NOT_FOUND", "missing"),
    ),
    "not_found",
  );
  assert.equal(
    resourceConsumptionFailure(
      new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "offline"),
    ),
    "offline",
  );
});
