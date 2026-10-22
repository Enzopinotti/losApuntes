import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import {
  MobileQaNeedsHelpApi,
  QaNeedsHelpHttpTransport,
  parseQaNeedsHelpPage,
  type QaNeedsHelpTransport,
} from "../src/features/community/qa-needs-help-api";
import type { SessionController } from "../src/features/session/session-controller";

const subjectId = "bbde8519-5796-429c-b078-7b705edc5a0b";
const firstQuestionId = "269f2da7-f70c-418d-9151-000000000001";
const secondQuestionId = "269f2da7-f70c-418d-9151-000000000002";

function question(overrides: Record<string, unknown> = {}) {
  return {
    questionId: firstQuestionId,
    subjectId,
    title: "¿Cómo resuelvo este ejercicio de Cálculo?",
    createdAt: "2026-10-19T14:00:00.000Z",
    ...overrides,
  };
}

test("needs-help page validates the selected subject and server-owned projection", () => {
  assert.deepEqual(
    parseQaNeedsHelpPage(
      {
        items: [question()],
        nextCursor: "eyJ2IjoxfQ",
      },
      subjectId,
    ),
    { items: [question()], nextCursor: "eyJ2IjoxfQ" },
  );
  assert.deepEqual(
    parseQaNeedsHelpPage({ items: [], nextCursor: null }, subjectId),
    { items: [], nextCursor: null },
  );
  assert.deepEqual(
    parseQaNeedsHelpPage(
      {
        items: [question({ authorId: "private", body: "private body" })],
        nextCursor: null,
      },
      subjectId,
    ).items[0],
    question(),
  );
});

test("needs-help parser rejects invalid data, subject leakage and cursor order", () => {
  const invalid = [
    [
      { items: [question({ questionId: "bad-id" })], nextCursor: null },
      subjectId,
    ],
    [
      {
        items: [
          question({ subjectId: "a2f47be6-e403-46ac-a913-90b778a92d8c" }),
        ],
        nextCursor: null,
      },
      subjectId,
    ],
    [{ items: [question({ title: " " })], nextCursor: null }, subjectId],
    [
      { items: [question({ createdAt: "2026-10-19" })], nextCursor: null },
      subjectId,
    ],
    [{ items: [], nextCursor: "eyJ2IjoxfQ" }, subjectId],
    [{ items: [], nextCursor: "bad cursor" }, subjectId],
    [
      {
        items: [question({ questionId: secondQuestionId }), question()],
        nextCursor: null,
      },
      subjectId,
    ],
    [{ items: [question(), question()], nextCursor: null }, subjectId],
    [
      {
        items: Array.from({ length: 16 }, (_value, index) =>
          question({
            questionId: `269f2da7-f70c-418d-9151-${String(index + 1).padStart(12, "0")}`,
            createdAt: `2026-10-${String(index + 1).padStart(2, "0")}T14:00:00.000Z`,
          }),
        ),
        nextCursor: null,
      },
      subjectId,
    ],
  ] as const;

  for (const [page, requestedSubjectId] of invalid) {
    assert.throws(
      () => parseQaNeedsHelpPage(page, requestedSubjectId),
      (error: unknown) =>
        error instanceof ApiRequestError &&
        error.code === "QA_NEEDS_HELP_UNAVAILABLE",
    );
  }
  assert.throws(
    () =>
      parseQaNeedsHelpPage({ items: [], nextCursor: null }, "not-a-subject"),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "QA_NEEDS_HELP_SUBJECT_INVALID",
  );
});

test("transport sends only canonical subject, opaque cursor and session credential", async () => {
  const calls: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      calls.push(args);
      return { items: [], nextCursor: null };
    },
  };
  const transport = new QaNeedsHelpHttpTransport(client as never);

  await transport.get("session-token", subjectId);
  await transport.get("session-token", subjectId, "eyJ2IjoxfQ");

  assert.deepEqual(calls[0], [
    `/qa/discovery/needs-help?subjectId=${subjectId}`,
    { credential: "session-token" },
  ]);
  assert.deepEqual(calls[1], [
    `/qa/discovery/needs-help?subjectId=${subjectId}&cursor=eyJ2IjoxfQ`,
    { credential: "session-token" },
  ]);
});

test("needs-help API fences credentials and validates the subject before transport", async () => {
  const credentialSnapshot = { credential: "session-token", generation: 4 };
  let authoritative = true;
  let invalidated = 0;
  let transportCalls = 0;
  const session = {
    getCredentialSnapshot: () => credentialSnapshot,
    isCredentialAuthoritative: () => authoritative,
    invalidateIfAuthoritative: async () => {
      invalidated += 1;
      return true;
    },
    restrictIfAuthoritative: async () => true,
  } as unknown as SessionController;
  const transport: QaNeedsHelpTransport = {
    get: async () => {
      transportCalls += 1;
      return { items: [question()], nextCursor: null };
    },
  };
  const api = new MobileQaNeedsHelpApi(session, transport);

  await assert.rejects(
    api.list("invalid-subject"),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "QA_NEEDS_HELP_SUBJECT_INVALID",
  );
  assert.equal(transportCalls, 0);
  assert.deepEqual(await api.list(subjectId), {
    items: [question()],
    nextCursor: null,
  });

  authoritative = false;
  await assert.rejects(
    api.list(subjectId),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidated, 1);
});
