import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import {
  AcademicFollowsMobileApi,
  parseAcademicCatalogSearch,
  parseAcademicFollows,
  type AcademicFollowsTransport,
} from "../src/features/academic/academic-follows-api";

const institutionId = "bbde8519-5796-429c-b078-7b705edc5a0b";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("follow list parser normalizes safe fields and rejects duplicate identities", () => {
  const result = parseAcademicFollows({
    follows: [
      {
        targetId: institutionId.toUpperCase(),
        kind: "institution",
        name: "  Universidad Nacional  ",
        privateField: "discarded",
      },
    ],
    truncated: false,
    limit: 100,
  });
  assert.deepEqual(result, {
    follows: [
      {
        targetId: institutionId,
        kind: "institution",
        name: "Universidad Nacional",
      },
    ],
    truncated: false,
    limit: 100,
  });

  assert.throws(
    () =>
      parseAcademicFollows({
        follows: [
          { targetId: institutionId, kind: "institution", name: "UNA" },
          { targetId: institutionId, kind: "institution", name: "Another" },
        ],
        truncated: false,
        limit: 100,
      }),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "ACADEMIC_FOLLOW_RESPONSE_INVALID",
  );
});

test("catalog parser projects only active nodes and bounds opaque cursors", () => {
  const result = parseAcademicCatalogSearch(
    {
      items: [
        {
          id: institutionId,
          kind: "institution",
          name: "Universidad Nacional",
          parentIds: [],
          status: "active",
          privateField: "discarded",
        },
      ],
      nextCursor: "next-page",
    },
    "institution",
  );
  assert.deepEqual(result, {
    items: [
      {
        id: institutionId,
        kind: "institution",
        name: "Universidad Nacional",
        parentIds: [],
        status: "active",
      },
    ],
    nextCursor: "next-page",
  });
  assert.throws(
    () =>
      parseAcademicCatalogSearch({ items: [], nextCursor: "x" }, "institution"),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "ACADEMIC_FOLLOW_RESPONSE_INVALID",
  );
});

test("owner follow operations use the session credential while catalog search is public", async () => {
  const calls: string[] = [];
  const session = {
    getCredentialSnapshot: () => ({ credential: "owner-token", generation: 9 }),
    isCredentialAuthoritative: () => true,
    invalidateIfAuthoritative: async () => undefined,
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  const transport: AcademicFollowsTransport = {
    academicFollows: async (credential) => {
      calls.push(`list:${credential}`);
      return { follows: [], truncated: false, limit: 100 };
    },
    academicCatalogSearch: async (input) => {
      calls.push(`search:${input.q}`);
      return { items: [], nextCursor: null };
    },
    followAcademicNode: async (credential, nodeId) => {
      calls.push(`follow:${credential}:${nodeId}`);
      return {
        following: true,
        target: {
          id: institutionId,
          kind: "institution",
          name: "Universidad Nacional",
        },
      };
    },
    unfollowAcademicNode: async (credential, nodeId) => {
      calls.push(`unfollow:${credential}:${nodeId}`);
    },
  };
  const api = new AcademicFollowsMobileApi(session, transport);

  await api.list();
  await api.search("institution", "Nacional");
  await api.follow(institutionId);
  await api.unfollow(institutionId);

  assert.deepEqual(calls, [
    "list:owner-token",
    "search:Nacional",
    `follow:owner-token:${institutionId}`,
    `unfollow:owner-token:${institutionId}`,
  ]);
});

test("a follow list response is rejected after its credential loses authority", async () => {
  const pending = deferred<unknown>();
  let authoritative = true;
  const session = {
    getCredentialSnapshot: () => ({ credential: "owner-token", generation: 9 }),
    isCredentialAuthoritative: () => authoritative,
    invalidateIfAuthoritative: async () => undefined,
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  const transport: AcademicFollowsTransport = {
    academicFollows: () => pending.promise,
    academicCatalogSearch: async () => ({ items: [], nextCursor: null }),
    followAcademicNode: async () => ({ following: true }),
    unfollowAcademicNode: async () => undefined,
  };
  const api = new AcademicFollowsMobileApi(session, transport);
  const result = api.list();
  authoritative = false;
  pending.resolve({ follows: [], truncated: false, limit: 100 });

  await assert.rejects(
    result,
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
});
