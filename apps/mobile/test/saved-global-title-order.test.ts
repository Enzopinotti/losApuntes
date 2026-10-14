import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MobileResourceConsumptionHttpTransport,
  type ResourceConsumptionApi,
  type ResourceSavedPage,
} from "../src/features/resources/resource-consumption-api";
import { MobileSavedResourcesController } from "../src/features/resources/resource-consumption-controller";
import type { MobileApiClient } from "../src/services/api/client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

test("global title-only browsing uses the saved search endpoint; default stays legacy", async () => {
  const urls: string[] = [];
  const transport = new MobileResourceConsumptionHttpTransport({
    request: async (url: string) => {
      urls.push(url);
      return { items: [], nextCursor: null };
    },
  } as unknown as MobileApiClient);
  await transport.saved("token-a", undefined, undefined, undefined, undefined, "title");
  await transport.saved("token-a", "title-page2", undefined, "Álgebra", "11111111-1111-4111-8111-111111111111", "title");
  await transport.saved("token-a");
  const [first, next, legacy] = urls.map((url) => new URL(url, "https://example.invalid"));
  assert.equal(first!.pathname, "/resources/saved/search");
  assert.equal(first!.searchParams.get("order"), "title");
  assert.equal(first!.searchParams.has("q"), false);
  assert.equal(next!.searchParams.get("order"), "title");
  assert.equal(next!.searchParams.get("q"), "Álgebra");
  assert.equal(next!.searchParams.get("subjectId"), "11111111-1111-4111-8111-111111111111");
  assert.equal(next!.searchParams.get("cursor"), "title-page2");
  assert.equal(legacy!.pathname, "/resources/saved");
  assert.equal(legacy!.searchParams.has("order"), false);
});

test("title mode stays attached to every cursor page", async () => {
  const calls: Array<{ cursor?: string; query?: string; subject?: string; order?: string }> = [];
  const api = {
    saved: async (
      cursor?: string,
      _signal?: AbortSignal,
      query?: string,
      subject?: string,
      order?: "saved" | "title",
    ): Promise<ResourceSavedPage> => {
      calls.push({ cursor, query, subject, order });
      return { items: [], nextCursor: cursor ? null : "next-title-page" };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("account-a", "parcial", "11111111-1111-4111-8111-111111111111", "title");
  await controller.loadMore("account-a");
  assert.deepEqual(calls, [
    { cursor: undefined, query: "parcial", subject: "11111111-1111-4111-8111-111111111111", order: "title" },
    { cursor: "next-title-page", query: "parcial", subject: "11111111-1111-4111-8111-111111111111", order: "title" },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") assert.equal(snapshot.order, "title");
});

test("switching title to saved mode cancels obsolete responses under the same session", async () => {
  const previous = deferred<ResourceSavedPage>();
  let requests = 0;
  let firstSignal: AbortSignal | undefined;
  const api = {
    saved: async (_cursor?: string, signal?: AbortSignal): Promise<ResourceSavedPage> => {
      requests++;
      if (requests === 1) {
        firstSignal = signal;
        return previous.promise;
      }
      return { items: [], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  const old = controller.load("account-a", undefined, undefined, "title");
  await controller.load("account-a", undefined, undefined, "saved");
  previous.resolve({ items: [], nextCursor: "stale-title-cursor" });
  await old;
  assert.equal(firstSignal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.order, undefined);
    assert.equal(snapshot.data.nextCursor, null);
  }
  controller.invalidate("account-a");
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("screen uses global sort as request scope and keeps server order across loaded pages", () => {
  const screen = readFileSync(
    new URL("../src/features/resources/saved-resources-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(screen, /controller\.load\(authorityKey, searchQuery \|\| undefined, selectedSubjectId \?\? undefined, sort\)/u);
  assert.match(screen, /\(snapshot\.order \?\? "saved"\) === sort/u);
  assert.match(screen, /findLoadedSavedResources\(\s*current\.data\.items,\s*"",\s*"saved",\s*null,/u);
  assert.match(screen, /Título A–Z ordena toda la biblioteca desde el servidor/u);
});
