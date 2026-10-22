import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import {
  MobileQaReceivedRepliesApi,
  QaReceivedRepliesHttpTransport,
  parseQaReceivedRepliesPage,
  type QaReceivedRepliesTransport,
} from "../src/features/community/qa-received-replies-api";
import type { SessionController } from "../src/features/session/session-controller";

const firstAnswerId = "9a73b180-ef29-4489-b7c5-000000000001";
const secondAnswerId = "9a73b180-ef29-4489-b7c5-000000000002";
const questionId = "a7f8eab6-42c8-4539-9fcd-8ce5d8794581";
const subjectId = "a2f47be6-e403-46ac-a913-90b778a92d8c";

function reply(overrides: Record<string, unknown> = {}) {
  return {
    answerId: firstAnswerId,
    questionId,
    subjectId,
    questionTitle: "¿Cómo preparo el final de Álgebra?",
    answeredAt: "2026-10-20T15:00:00.000Z",
    isAccepted: false,
    ...overrides,
  };
}

test("received replies validates the bounded owner inbox projection", () => {
  assert.deepEqual(
    parseQaReceivedRepliesPage({ items: [reply()], nextCursor: null }),
    {
      items: [reply()],
      nextCursor: null,
    },
  );
  assert.deepEqual(
    parseQaReceivedRepliesPage({ items: [], nextCursor: null }),
    {
      items: [],
      nextCursor: null,
    },
  );
  assert.deepEqual(
    parseQaReceivedRepliesPage({
      items: [reply({ author: { id: "private" }, body: "private answer" })],
      nextCursor: "eyJ2IjoxfQ",
    }).items[0],
    reply(),
  );
});

test("received replies rejects invalid rows, ordering, duplicates and cursors", () => {
  const invalidPages = [
    { items: [reply({ answerId: "not-a-uuid" })], nextCursor: null },
    { items: [reply({ questionTitle: "  " })], nextCursor: null },
    { items: [reply({ answeredAt: "2026-10-20" })], nextCursor: null },
    { items: [reply({ isAccepted: 1 })], nextCursor: null },
    { items: [], nextCursor: "not a cursor" },
    { items: [], nextCursor: "eyJ2IjoxfQ" },
    { items: Array.from({ length: 11 }, () => reply()), nextCursor: null },
    {
      items: [reply({ answerId: secondAnswerId }), reply()],
      nextCursor: null,
    },
    { items: [reply(), reply()], nextCursor: null },
  ];

  for (const page of invalidPages) {
    assert.throws(
      () => parseQaReceivedRepliesPage(page),
      (error: unknown) =>
        error instanceof ApiRequestError &&
        error.code === "QA_RECEIVED_REPLIES_UNAVAILABLE",
    );
  }
});

test("transport binds only the validated credential and opaque cursor", async () => {
  const calls: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      calls.push(args);
      return { items: [], nextCursor: null };
    },
  };
  const transport = new QaReceivedRepliesHttpTransport(client as never);

  await transport.get("session-token");
  await transport.get("session-token", "eyJ2IjoxfQ");

  assert.deepEqual(calls[0], [
    "/qa/me/received-replies",
    { credential: "session-token" },
  ]);
  assert.deepEqual(calls[1], [
    "/qa/me/received-replies?cursor=eyJ2IjoxfQ",
    { credential: "session-token" },
  ]);
});

test("API derives ownership from current session and rejects stale session authority", async () => {
  const credentialSnapshot = { credential: "session-token", generation: 4 };
  let authoritative = true;
  let invalidated = 0;
  const session = {
    getCredentialSnapshot: () => credentialSnapshot,
    isCredentialAuthoritative: () => authoritative,
    invalidateIfAuthoritative: async () => {
      invalidated += 1;
      return true;
    },
    restrictIfAuthoritative: async () => true,
  } as unknown as SessionController;
  const seen: Array<{ credential: string; cursor?: string }> = [];
  const transport: QaReceivedRepliesTransport = {
    get: async (credential, cursor) => {
      seen.push(cursor ? { credential, cursor } : { credential });
      return { items: [reply()], nextCursor: null };
    },
  };
  const api = new MobileQaReceivedRepliesApi(session, transport);

  assert.deepEqual(await api.list(), { items: [reply()], nextCursor: null });
  assert.deepEqual(seen, [{ credential: "session-token" }]);

  authoritative = false;
  await assert.rejects(
    api.list(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidated, 1);
});

test("missing credentials reject before the received replies endpoint is read", async () => {
  let transportCalls = 0;
  const session = {
    getCredentialSnapshot: () => null,
  } as unknown as SessionController;
  const transport: QaReceivedRepliesTransport = {
    get: async () => {
      transportCalls += 1;
      return { items: [], nextCursor: null };
    },
  };
  const api = new MobileQaReceivedRepliesApi(session, transport);

  await assert.rejects(
    api.list(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.status === 401 &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.equal(transportCalls, 0);
});
