import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRequestError,
  type MobileApiClient,
} from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import { MobileOwnedResourcesApi } from "../src/features/resources/resource-owned-api";

function setup({
  credential = true,
  authoritative = true,
}: {
  credential?: boolean;
  authoritative?: boolean;
} = {}) {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  let invalidations = 0;
  const session = {
    getCredentialSnapshot: () =>
      credential ? { credential: "session-secret", generation: 3 } : null,
    isCredentialAuthoritative: () => authoritative,
    invalidateIfAuthoritative: async () => {
      invalidations += 1;
    },
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  const client = {
    request: async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return path === "/resources/mine/subjects"
        ? { items: [], truncated: false }
        : { items: [], nextCursor: null };
    },
  } as unknown as MobileApiClient;
  return {
    api: new MobileOwnedResourcesApi(session, client),
    calls,
    invalidations: () => invalidations,
  };
}

test("authenticated listing requests only session owner's resources", async () => {
  const { api, calls } = setup();
  assert.deepEqual(await api.listOwned({}), {
    items: [],
    nextCursor: null,
  });
  assert.deepEqual(calls, [
    {
      path: "/resources/mine?limit=25",
      options: { credential: "session-secret" },
    },
  ]);
});

test("visibility and cursor are encoded in the next page request", async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  await api.listOwned(
    { visibility: "shared", cursor: "page?with=value" },
    signal,
  );
  assert.deepEqual(calls, [
    {
      path: "/resources/mine?limit=25&visibility=shared&cursor=page%3Fwith%3Dvalue",
      options: { credential: "session-secret", signal },
    },
  ]);
});

test("missing session refuses fetching private publications", async () => {
  const { api, calls } = setup({ credential: false });
  await assert.rejects(
    () => api.listOwned({}),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.deepEqual(calls, []);
});

test("an old session's response is rejected after credential changes", async () => {
  const { api, invalidations } = setup({ authoritative: false });
  await assert.rejects(
    () => api.listOwned({}),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidations(), 1);
});

test("owner subject facets use a credentialed request without another user's ID", async () => {
  const { api, calls } = setup();
  assert.deepEqual(await api.listSubjects(), {
    items: [],
    truncated: false,
  });
  assert.deepEqual(calls, [
    {
      path: "/resources/mine/subjects",
      options: { credential: "session-secret" },
    },
  ]);
});

test("all advanced owner filters are serialized in the server request", async () => {
  const { api, calls } = setup();
  await api.listOwned({
    visibility: "shared",
    q: "álgebra & SQL",
    subjectId: "22222222-2222-4222-8222-222222222222",
    order: "oldest",
    cursor: "page=2",
  });
  assert.deepEqual(calls, [
    {
      path: "/resources/mine?limit=25&visibility=shared&q=%C3%A1lgebra+%26+SQL&subjectId=22222222-2222-4222-8222-222222222222&order=oldest&cursor=page%3D2",
      options: { credential: "session-secret" },
    },
  ]);
});

test("unauthorized account cannot enumerate its private subject facets", async () => {
  const { api, calls } = setup({ credential: false });
  await assert.rejects(
    () => api.listSubjects(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.deepEqual(calls, []);
});
