import assert from "node:assert/strict";
import test from "node:test";

import type { SearchResponse } from "@losapuntes/contracts";

import { MobileSearchController } from "../src/features/search/search-controller";
import type { MobileSearchApi } from "../src/features/search/search-api";
import { ApiRequestError } from "../src/services/api/client";

const response = (query: string): SearchResponse => ({
  query,
  scope: "all",
  results: { resources: [], subjects: [], people: [] },
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

const apiStub = (overrides: Partial<MobileSearchApi>): MobileSearchApi =>
  ({
    search: async () => response("default"),
    contextualDiscovery: async () => ({ subjects: [] }),
    ...overrides,
  }) as unknown as MobileSearchApi;

test("debounces rapid query and scope changes into the last request", async () => {
  const calls: Array<{ q: string; scope: string }> = [];
  const controller = new MobileSearchController(
    apiStub({
      search: async (input) => {
        calls.push({ q: input.q, scope: input.scope });
        return response(input.q);
      },
    }),
  );

  controller.scheduleSearch(
    "session-a:context-1",
    {
      q: "base",
      scope: "all",
    },
    15,
  );
  await new Promise((resolve) => setTimeout(resolve, 3));
  controller.scheduleSearch(
    "session-a:context-1",
    {
      q: "base de datos",
      scope: "subjects",
    },
    15,
  );
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.deepEqual(calls, [{ q: "base de datos", scope: "subjects" }]);
});

test("aborts and fences a late response after query, scope, and context change", async () => {
  const first = deferred<SearchResponse>();
  const second = deferred<SearchResponse>();
  const signals: AbortSignal[] = [];
  const inputs: Array<{ q: string; scope: string; subjectId?: string }> = [];
  let callCount = 0;
  const controller = new MobileSearchController(
    apiStub({
      search: async (input, signal) => {
        callCount += 1;
        inputs.push(input);
        signals.push(signal!);
        return callCount === 1 ? first.promise : second.promise;
      },
    }),
  );

  const oldSearch = controller.search("session-a:context-1", {
    q: "bases",
    scope: "all",
  });
  const currentSearch = controller.search("session-a:context-2", {
    q: "base de datos",
    scope: "resources",
    subjectId: "subject-a",
  });
  second.resolve(response("base de datos"));
  await currentSearch;
  first.resolve(response("bases"));
  await oldSearch;

  assert.equal(signals[0]?.aborted, true);
  assert.deepEqual(inputs[1], {
    q: "base de datos",
    scope: "resources",
    subjectId: "subject-a",
  });
  assert.deepEqual(controller.getSearchSnapshot(), {
    kind: "ready",
    authorityKey: "session-a:context-2",
    query: "base de datos",
    scope: "resources",
    data: response("base de datos"),
  });
});

test("session/context invalidation aborts search and contextual discovery", async () => {
  const search = deferred<SearchResponse>();
  const contextual = deferred<{ subjects: [] }>();
  const signals: AbortSignal[] = [];
  const controller = new MobileSearchController(
    apiStub({
      search: async (_input, signal) => {
        signals.push(signal!);
        return search.promise;
      },
      contextualDiscovery: async (signal) => {
        signals.push(signal!);
        return contextual.promise;
      },
    }),
  );

  const searchRequest = controller.search("session-a:context-1", {
    q: "apuntes",
    scope: "all",
  });
  const contextRequest = controller.loadContextual("session-a:context-1");
  controller.invalidate("session-a:context-1");
  search.resolve(response("apuntes"));
  contextual.resolve({ subjects: [] });
  await Promise.all([searchRequest, contextRequest]);

  assert.deepEqual(
    signals.map((signal) => signal.aborted),
    [true, true],
  );
  assert.deepEqual(controller.getSearchSnapshot(), { kind: "idle" });
  assert.deepEqual(controller.getContextualSnapshot(), { kind: "idle" });
});

test("distinguishes network, timeout, and server-unavailable states", async (t) => {
  const cases = [
    ["offline", "offline"],
    ["timeout", "timeout"],
    ["server_unavailable", "server_unavailable"],
  ] as const;

  for (const [failureKind, expectedKind] of cases) {
    await t.test(failureKind, async () => {
      const controller = new MobileSearchController(
        apiStub({
          search: async () => {
            throw new ApiRequestError(
              failureKind,
              null,
              failureKind.toUpperCase(),
              "request failed",
            );
          },
        }),
      );

      await controller.search("session-a:context-1", {
        q: "apuntes",
        scope: "all",
      });

      assert.equal(controller.getSearchSnapshot().kind, expectedKind);
    });
  }
});
