import assert from "node:assert/strict";
import test from "node:test";

import type { StudyCollection } from "../src/features/study-collections/study-collections-api";
import {
  MobileStudyCollectionsApi,
  StudyCollectionsHttpTransport,
  type StudyCollectionsTransport,
} from "../src/features/study-collections/study-collections-api";
import {
  ApiRequestError,
  type MobileApiClient,
} from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";

const collection: StudyCollection = {
  id: "collection-id",
  title: "Análisis",
  description: null,
  resourceCount: 2,
  revision: 4,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

function setup(
  options: { authorized?: boolean; sessionChanged?: boolean } = {},
) {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  let invalidations = 0;
  const session = {
    getCredentialSnapshot: () =>
      options.authorized === false
        ? null
        : { credential: "session-token", generation: 7 },
    isCredentialAuthoritative: () => !options.sessionChanged,
    invalidateIfAuthoritative: async () => {
      invalidations += 1;
    },
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  const client = {
    request: async (path: string, requestOptions: Record<string, unknown>) => {
      calls.push({ path, options: requestOptions });
      if (
        requestOptions.method === "POST" ||
        requestOptions.method === "PATCH"
      ) {
        return { collection };
      }
      if (requestOptions.method === "PUT") return { collection };
      return { items: [], nextCursor: null, revision: 4 };
    },
  } as unknown as MobileApiClient;
  const transport = new StudyCollectionsHttpTransport(client);
  return {
    api: new MobileStudyCollectionsApi(session, transport),
    calls,
    invalidations: () => invalidations,
  };
}

test("list uses the authenticated collection endpoint with a bounded page", async () => {
  const { api, calls } = setup();
  await api.list("next/page");
  assert.deepEqual(calls, [
    {
      path: "/study-collections?limit=25&cursor=next%2Fpage",
      options: { credential: "session-token" },
    },
  ]);
});

test("create preserves the caller operation key and abort signal", async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  const input = {
    operationKey: "b8922758-a89d-4fc7-b2dd-15c1cddc888c",
    title: "Álgebra II",
    description: "Repaso",
  };
  assert.deepEqual(await api.create(input, signal), { collection });
  assert.deepEqual(calls, [
    {
      path: "/study-collections",
      options: {
        method: "POST",
        credential: "session-token",
        body: input,
        signal,
      },
    },
  ]);
});

test("collection reads and metadata edits use revision-aware authorized routes", async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  await api.get("collection/id", signal);
  await api.resources("collection/id", "opaque/cursor", signal);
  await api.update(
    "collection/id",
    { expectedRevision: 4, title: "Nuevo título", description: "" },
    signal,
  );
  assert.deepEqual(calls, [
    {
      path: "/study-collections/collection%2Fid",
      options: { credential: "session-token", signal },
    },
    {
      path: "/study-collections/collection%2Fid/resources?limit=25&cursor=opaque%2Fcursor",
      options: { credential: "session-token", signal },
    },
    {
      path: "/study-collections/collection%2Fid",
      options: {
        method: "PATCH",
        credential: "session-token",
        body: { expectedRevision: 4, title: "Nuevo título", description: "" },
        signal,
      },
    },
  ]);
});

test("adding a resource uses the collection's idempotent membership route", async () => {
  const { api, calls } = setup();
  await api.add("collection-id", "resource-id");
  assert.deepEqual(calls, [
    {
      path: "/study-collections/collection-id/resources/resource-id",
      options: { method: "PUT", credential: "session-token" },
    },
  ]);
});

test("resource removal carries the current revision and escapes path IDs", async () => {
  const { api, calls } = setup();
  await api.remove("collection/a", "resource/b", 9);
  assert.equal(
    calls[0]?.path,
    "/study-collections/collection%2Fa/resources/resource%2Fb?expectedRevision=9",
  );
  assert.deepEqual(calls[0]?.options, {
    method: "DELETE",
    credential: "session-token",
  });
});

test("missing credentials reject before sending a collection request", async () => {
  const { api, calls } = setup({ authorized: false });
  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.deepEqual(calls, []);
});

test("late collection acknowledgements are rejected after the session changes", async () => {
  const { api, invalidations } = setup({ sessionChanged: true });
  await assert.rejects(
    () => api.delete("collection-id"),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidations(), 1);
});

test("rejected collection mutations invalidate an unauthorized session", async () => {
  let invalidations = 0;
  const session = {
    getCredentialSnapshot: () => ({
      credential: "session-token",
      generation: 1,
    }),
    isCredentialAuthoritative: () => true,
    invalidateIfAuthoritative: async () => {
      invalidations += 1;
    },
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  const transport = {
    delete: async () => {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "SESSION_EXPIRED",
        "Expired",
      );
    },
  } as unknown as StudyCollectionsTransport;
  const api = new MobileStudyCollectionsApi(session, transport);
  await assert.rejects(() => api.delete("collection-id"));
  assert.equal(invalidations, 1);
});
