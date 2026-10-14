import assert from "node:assert/strict";
import test from "node:test";

import type { MobileApiClient } from "../src/services/api/client";
import { ApiRequestError } from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import { MobileOwnerStatisticsApi } from "../src/features/resources/resource-owner-stats-api";

function setup(options: { session?: boolean; authoritative?: boolean } = {}) {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  let invalidations = 0;
  let restrictions = 0;
  const session = {
    getCredentialSnapshot: () =>
      options.session === false
        ? null
        : { credential: "private-token", generation: 5 },
    isCredentialAuthoritative: () => options.authoritative !== false,
    invalidateIfAuthoritative: async () => {
      invalidations += 1;
    },
    restrictIfAuthoritative: async () => {
      restrictions += 1;
    },
  } as unknown as SessionController;
  const client = {
    request: async (path: string, values: Record<string, unknown>) => {
      calls.push({ path, options: values });
      return {
        generatedAt: "2026-10-12T00:00:00.000Z",
        publications: { total: 0, private: 0, shared: 0, public: 0 },
        currentSaves: 0,
        activeShareGrants: 0,
        topResources: [],
      };
    },
  } as unknown as MobileApiClient;
  return {
    api: new MobileOwnerStatisticsApi(session, client),
    calls,
    invalidations: () => invalidations,
    restrictions: () => restrictions,
  };
}

test("fetches the authenticated owner stats without a user query parameter", async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  const value = await api.getStatistics(signal);
  assert.equal(value.publications.total, 0);
  assert.deepEqual(calls, [
    {
      path: "/resources/mine/stats",
      options: { credential: "private-token", signal },
    },
  ]);
});

test("unauthenticated callers cannot request private statistics", async () => {
  const { api, calls } = setup({ session: false });
  await assert.rejects(
    () => api.getStatistics(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.deepEqual(calls, []);
});

test("late statistics from the prior credential are rejected", async () => {
  const { api, invalidations } = setup({ authoritative: false });
  await assert.rejects(
    () => api.getStatistics(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidations(), 1);
});
