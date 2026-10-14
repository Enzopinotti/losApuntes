import assert from "node:assert/strict";
import test from "node:test";

import type {
  ResourceConsumptionApi,
  ResourceSavedPage,
} from "../src/features/resources/resource-consumption-api";
import { MobileSavedResourcesController } from "../src/features/resources/resource-consumption-controller";
import { MobileResourceConsumptionHttpTransport } from "../src/features/resources/resource-consumption-api";
import type { MobileApiClient } from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import {
  MobileSavedSubjectFacetsController,
  MobileSavedSubjectFacetsApi,
  type SavedSubjectFacetsPage,
} from "../src/features/resources/saved-subject-facets";

const SUBJECT_A = "11111111-1111-4111-8111-111111111111";
const SUBJECT_B = "22222222-2222-4222-8222-222222222222";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

test("selected Subject reaches every saved-search page with unchanged query", async () => {
  const calls: Array<{
    cursor?: string | undefined;
    query?: string | undefined;
    subject?: string | undefined;
  }> = [];
  const api = {
    saved: async (
      cursor?: string,
      _signal?: AbortSignal,
      query?: string,
      subject?: string,
    ): Promise<ResourceSavedPage> => {
      calls.push({ cursor, query, subject });
      return { items: [], nextCursor: cursor ? null : "more" };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  await controller.load("session-a", "parcial", SUBJECT_A);
  await controller.loadMore("session-a");
  assert.deepEqual(calls, [
    { cursor: undefined, query: "parcial", subject: SUBJECT_A },
    { cursor: "more", query: "parcial", subject: SUBJECT_A },
  ]);
  const result = controller.getSnapshot();
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") assert.equal(result.subjectId, SUBJECT_A);
});

test("subject change aborts stale pages even under the same session and query", async () => {
  const first = deferred<ResourceSavedPage>();
  let calls = 0;
  let signal: AbortSignal | undefined;
  const api = {
    saved: async (_cursor?: string, nextSignal?: AbortSignal) => {
      calls += 1;
      if (calls === 1) {
        signal = nextSignal;
        return first.promise;
      }
      return { items: [], nextCursor: null };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);
  const previous = controller.load("session-a", "parcial", SUBJECT_A);
  await controller.load("session-a", "parcial", SUBJECT_B);
  first.resolve({ items: [], nextCursor: "stale-cursor" });
  await previous;
  assert.equal(signal?.aborted, true);
  const result = controller.getSnapshot();
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.subjectId, SUBJECT_B);
    assert.equal(result.data.nextCursor, null);
  }
});

test("global facet controller cancels old account responses and never persists data", async () => {
  const pending = deferred<SavedSubjectFacetsPage>();
  let count = 0;
  let firstSignal: AbortSignal | undefined;
  const controller = new MobileSavedSubjectFacetsController({
    subjects: async (signal?: AbortSignal) => {
      count += 1;
      if (count === 1) {
        firstSignal = signal;
        return pending.promise;
      }
      return {
        items: [{ subjectId: SUBJECT_B, name: "Física", count: 2 }],
        truncated: false,
      };
    },
  });
  const stale = controller.load("account-a");
  await controller.load("account-b");
  pending.resolve({
    items: [{ subjectId: SUBJECT_A, name: "Privado", count: 3 }],
    truncated: false,
  });
  await stale;
  assert.equal(firstSignal?.aborted, true);
  const ready = controller.getSnapshot();
  assert.equal(ready.kind, "ready");
  if (ready.kind === "ready") {
    assert.equal(ready.authorityKey, "account-b");
    assert.deepEqual(
      ready.data.items.map((facet) => facet.subjectId),
      [SUBJECT_B],
    );
  }
  controller.invalidate("account-b");
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("transport routes subject-only and compound filters without changing the legacy list", async () => {
  const urls: string[] = [];
  const fake = {
    request: async (url: string) => {
      urls.push(url);
      return { items: [], nextCursor: null };
    },
  } as unknown as MobileApiClient;
  const api = new MobileResourceConsumptionHttpTransport(fake);
  await api.saved("credential", undefined, undefined, undefined, SUBJECT_A);
  await api.saved("credential", "opaque", undefined, "parcial", SUBJECT_B);
  await api.saved("credential");
  assert.equal(
    new URL(urls[0]!, "https://example.test").pathname,
    "/resources/saved/search",
  );
  assert.equal(
    new URL(urls[0]!, "https://example.test").searchParams.get("subjectId"),
    SUBJECT_A,
  );
  assert.equal(
    new URL(urls[1]!, "https://example.test").searchParams.get("q"),
    "parcial",
  );
  assert.equal(
    new URL(urls[1]!, "https://example.test").searchParams.get("cursor"),
    "opaque",
  );
  assert.equal(
    new URL(urls[2]!, "https://example.test").pathname,
    "/resources/saved",
  );
});

test("saved-subject API scopes facets to the authenticated credential", async () => {
  const credentials: string[] = [];
  const session = {
    getCredentialSnapshot: () => ({ credential: "token-a", generation: 4 }),
    isCredentialAuthoritative: (credential: string, generation: number) =>
      credential === "token-a" && generation === 4,
  } as unknown as SessionController;
  const client = {
    request: async (_path: string, input: { credential: string }) => {
      credentials.push(input.credential);
      return { items: [], truncated: false };
    },
  } as unknown as MobileApiClient;
  const data = await new MobileSavedSubjectFacetsApi(
    session,
    client,
  ).subjects();
  assert.deepEqual(data, { items: [], truncated: false });
  assert.deepEqual(credentials, ["token-a"]);
});
