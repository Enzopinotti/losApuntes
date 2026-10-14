import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import type {
  ResourceConsumptionApi,
  ResourceSavedPage,
} from "../src/features/resources/resource-consumption-api";
import {
  MobileSavedResourcesController,
  resourceConsumptionFailure,
} from "../src/features/resources/resource-consumption-controller";
import { ApiRequestError } from "../src/services/api/client";

function resource(id: string): ResourceView {
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
    file: { id, filename: `${id}.pdf`, mimeType: "application/pdf", byteSize: 512 },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}

test("repeated continuation cursor becomes an explicit terminal recovery state", async () => {
  const calls: Array<string | undefined> = [];
  const pages: ResourceSavedPage[] = [
    { items: [resource("a")], nextCursor: "cursor-A" },
    { items: [resource("b")], nextCursor: "cursor-A" },
  ];
  const api = {
    saved: async (cursor?: string): Promise<ResourceSavedPage> => {
      calls.push(cursor);
      return pages.shift() ?? { items: [], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("owner-a", undefined, undefined, "title");
  await controller.loadMore("owner-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.paginationStalled, true);
  assert.equal(snapshot.data.nextCursor, null);
  assert.deepEqual(snapshot.data.items.map((item) => item.id), ["a", "b"]);
  await controller.loadMore("owner-a");
  assert.deepEqual(calls, [undefined, "cursor-A"]);
});

test("nonadjacent cursor cycle A-B-A is also stopped before any third repeat request", async () => {
  const calls: Array<string | undefined> = [];
  const api = {
    saved: async (cursor?: string): Promise<ResourceSavedPage> => {
      calls.push(cursor);
      if (!cursor) return { items: [], nextCursor: "cursor-A" };
      if (cursor === "cursor-A") return { items: [], nextCursor: "cursor-B" };
      return { items: [], nextCursor: "cursor-A" };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("owner-a", "parcial");
  await controller.loadMore("owner-a");
  await controller.loadMore("owner-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.data.nextCursor, null);
  assert.equal(snapshot.paginationStalled, true);
  await controller.loadMore("owner-a");
  assert.deepEqual(calls, [undefined, "cursor-A", "cursor-B"]);
});

test("a transient network failure preserves its cursor for a true retry", async () => {
  const calls: Array<string | undefined> = [];
  let attempt = 0;
  const api = {
    saved: async (cursor?: string): Promise<ResourceSavedPage> => {
      calls.push(cursor);
      if (!cursor) return { items: [resource("a")], nextCursor: "cursor-A" };
      attempt += 1;
      if (attempt === 1) {
        throw new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "No network");
      }
      return { items: [resource("b")], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("owner-a", "parcial");
  await controller.loadMore("owner-a");
  const failed = controller.getSnapshot();
  assert.equal(failed.kind, "ready");
  if (failed.kind !== "ready") return;
  assert.equal(failed.failure, "offline");
  assert.equal(failed.data.nextCursor, "cursor-A");
  assert.equal(failed.paginationStalled, false);
  await controller.loadMore("owner-a");
  const recovered = controller.getSnapshot();
  assert.equal(recovered.kind, "ready");
  if (recovered.kind !== "ready") return;
  assert.equal(recovered.failure, null);
  assert.equal(recovered.paginationStalled, false);
  assert.deepEqual(recovered.data.items.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(calls, [undefined, "cursor-A", "cursor-A"]);
});

test("changing an authority or search clears prior seen cursors", async () => {
  const calls: Array<string | undefined> = [];
  const api = {
    saved: async (cursor?: string): Promise<ResourceSavedPage> => {
      calls.push(cursor);
      return !cursor ? { items: [], nextCursor: "cursor-A" }
        : { items: [], nextCursor: "cursor-A" };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("owner-a", "matemática");
  await controller.loadMore("owner-a");
  assert.equal(controller.getSnapshot().kind, "ready");
  await controller.load("owner-a", "física");
  await controller.loadMore("owner-a");
  assert.deepEqual(calls, [undefined, "cursor-A", undefined, "cursor-A"]);
  controller.invalidate("owner-a");
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("the API timeout code is shown as a recoverable timeout, not a blank library", () => {
  assert.equal(
    resourceConsumptionFailure(
      new ApiRequestError("unexpected", 408, "RESOURCE_SAVED_QUERY_TIMEOUT", "Slow query"),
    ),
    "timeout",
  );
});

test("Saved renders rows in ProductSurface FlatList and keeps pagination manual", () => {
  const screen = readFileSync(
    new URL("../src/features/resources/saved-resources-screen.tsx", import.meta.url),
    "utf8",
  );
  const surface = readFileSync(
    new URL("../src/features/navigation/product-surface.tsx", import.meta.url),
    "utf8",
  );
  assert.match(screen, /flatList=\{\{/u);
  assert.match(screen, /data: shownResources/u);
  assert.match(screen, /keyExtractor: \(resource\) => resource\.id/u);
  assert.match(screen, /renderItem: \(\{ item: resource \}\)/u);
  assert.doesNotMatch(screen, /shownResources\.map\(/u);
  assert.match(surface, /<FlatList/u);
  assert.match(screen, /paginationStalled/u);
  assert.match(screen, /Reiniciar listado/u);
  assert.match(screen, /Reintentar carga/u);
  assert.doesNotMatch(screen, /onEndReached=/u);
});
