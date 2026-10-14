import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";
import type {
  ResourceConsumptionApi,
  ResourceSavedPage,
} from "../src/features/resources/resource-consumption-api";
import { MobileResourceConsumptionHttpTransport } from "../src/features/resources/resource-consumption-api";
import type { MobileApiClient } from "../src/services/api/client";
import { MobileSavedResourcesController } from "../src/features/resources/resource-consumption-controller";

const resource = (id: string) =>
  ({
    id,
    title: id,
    description: null,
    tags: [],
    visibility: "public",
    author: null,
    academic: {
      subject: { id: "subject-1", name: "Álgebra" },
      courseOffering: null,
    },
    file: {
      id,
      filename: "file.pdf",
      mimeType: "application/pdf",
      byteSize: 512,
    },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  }) as ResourceView;

test("saved search keeps the same query across cursor pages", async () => {
  const requests: Array<{ cursor?: string | undefined; q?: string | undefined }> = [];
  const api = {
    saved: async (
      cursor?: string,
      _signal?: AbortSignal,
      q?: string,
    ): Promise<ResourceSavedPage> => {
      requests.push({ cursor, q });
      return cursor
        ? { items: [resource("older")], nextCursor: null }
        : { items: [resource("recent")], nextCursor: "next-page" };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);

  await controller.load("session-a", "resumen");
  await controller.loadMore("session-a");

  const result = controller.getSnapshot();
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.searchQuery, "resumen");
    assert.deepEqual(
      result.data.items.map((r) => r.id),
      ["recent", "older"],
    );
  }
  assert.deepEqual(requests, [
    { cursor: undefined, q: "resumen" },
    { cursor: "next-page", q: "resumen" },
  ]);
});

test("switching search query cancels stale results and keeps the current page", async () => {
  let resolveFirst!: (value: ResourceSavedPage) => void;
  const pending = new Promise<ResourceSavedPage>((yes) => {
    resolveFirst = yes;
  });
  let calls = 0;
  let firstSignal: AbortSignal | undefined;
  const api = {
    saved: async (
      _cursor?: string,
      signal?: AbortSignal,
    ): Promise<ResourceSavedPage> => {
      calls += 1;
      if (calls === 1) {
        firstSignal = signal;
        return pending;
      }
      return { items: [resource("new-query")], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);

  const old = controller.load("session-a", "algebra");
  await controller.load("session-a", "fisica");
  resolveFirst({ items: [resource("stale")], nextCursor: null });
  await old;

  const result = controller.getSnapshot();
  assert.equal(firstSignal?.aborted, true);
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.searchQuery, "fisica");
    assert.deepEqual(
      result.data.items.map((r) => r.id),
      ["new-query"],
    );
  }
  controller.invalidate("session-a");
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("resource transport sends the query on its saved endpoint without exposing it in persistent state", async () => {
  const urls: string[] = [];
  const fakeClient = {
    request: async (url: string) => {
      urls.push(url);
      return { items: [], nextCursor: null };
    },
  } as unknown as MobileApiClient;
  const transport = new MobileResourceConsumptionHttpTransport(fakeClient);
  await transport.saved("credential", "opaque+/page", undefined, "Álgebra");
  const parsed = new URL(urls[0]!, "https://api.example.invalid");
  assert.equal(parsed.pathname, "/resources/saved/search");
  assert.equal(parsed.searchParams.get("cursor"), "opaque+/page");
  assert.equal(parsed.searchParams.get("q"), "Álgebra");
  assert.equal(parsed.searchParams.get("limit"), "25");

  await transport.saved("credential");
  const unfiltered = new URL(urls[1]!, "https://api.example.invalid");
  assert.equal(unfiltered.pathname, "/resources/saved");
  assert.equal(unfiltered.searchParams.has("q"), false);
});
