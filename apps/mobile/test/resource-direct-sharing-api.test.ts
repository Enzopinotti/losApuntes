import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView, SearchResponse } from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import type { MobileSearchApi } from "../src/features/search/search-api";
import type { ResourceConsumptionApi } from "../src/features/resources/resource-consumption-api";
import { MobileResourceDirectSharingApi } from "../src/features/resources/resource-direct-sharing-api";

function setup(options: { authorized?: boolean; sessionChanged?: boolean } = {}) {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  let invalidations = 0;
  const session = {
    getCredentialSnapshot: () =>
      options.authorized === false
        ? null
        : { credential: "secret-token", generation: 4 },
    isCredentialAuthoritative: () => !options.sessionChanged,
    invalidateIfAuthoritative: async () => {
      invalidations += 1;
    },
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  const client = {
    request: async (path: string, requestOptions: Record<string, unknown>) => {
      calls.push({ path, options: requestOptions });
      if (requestOptions.method === "PUT") return { shared: true };
      return undefined;
    },
  } as unknown as MobileApiClient;
  const search = {
    search: async (input: { q: string; scope: string }): Promise<SearchResponse> => ({
      query: input.q,
      scope: "people",
      results: {
        resources: [],
        subjects: [],
        people: [
          { profileId: "person-id", displayName: "Ana", avatarUrl: null },
        ],
      },
    }),
  } as unknown as Pick<MobileSearchApi, "search">;
  const resources = {
    resource: async () => ({
      resource: {
        id: "resource-a",
        revision: 2,
        visibility: "shared",
        capabilities: { edit: true, manageShares: true },
      } as ResourceView,
    }),
  } as Pick<ResourceConsumptionApi, "resource">;

  return {
    api: new MobileResourceDirectSharingApi(session, client, search, resources),
    calls,
    invalidations: () => invalidations,
  };
}

test("recipient lookup delegates to the authenticated people-only search", async () => {
  const { api } = setup();
  assert.deepEqual(await api.searchPeople("Ana"), [
    { profileId: "person-id", displayName: "Ana", avatarUrl: null },
  ]);
});

test("grant sends authenticated PUT to existing resource/profile route", async () => {
  const { api, calls } = setup();
  assert.deepEqual(
    await api.grant("resource-a", "person-id"),
    { shared: true },
  );
  assert.deepEqual(calls, [
    {
      path: "/resources/resource-a/shares/person-id",
      options: { method: "PUT", credential: "secret-token" },
    },
  ]);
});

test("revoke issues DELETE without a fabricated payload or grant list", async () => {
  const { api, calls } = setup();
  await api.revoke("resource-a", "person-id");
  assert.deepEqual(calls, [
    {
      path: "/resources/resource-a/shares/person-id",
      options: { method: "DELETE", credential: "secret-token" },
    },
  ]);
});

test("recipient IDs are escaped and caller abort signals are forwarded", async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  await api.grant("resource/a", "person/b", signal);
  assert.equal(
    calls[0]?.path,
    "/resources/resource%2Fa/shares/person%2Fb",
  );
  assert.equal(calls[0]?.options.signal, signal);
});

test("missing session rejects share writes before requesting the network", async () => {
  const { api, calls } = setup({ authorized: false });
  await assert.rejects(() => api.grant("r", "p"), (error: unknown) =>
    error instanceof ApiRequestError &&
    error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.deepEqual(calls, []);
});

test("a changed credential rejects a late acknowledgement", async () => {
  const { api, invalidations } = setup({ sessionChanged: true });
  await assert.rejects(() => api.grant("r", "p"), (error: unknown) =>
    error instanceof ApiRequestError &&
    error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidations(), 1);
});
