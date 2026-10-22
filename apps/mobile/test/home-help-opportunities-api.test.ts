import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import {
  HomeHelpOpportunitiesHttpTransport,
  MobileHomeHelpOpportunitiesApi,
  parseHomeHelpOpportunities,
  type HomeHelpOpportunitiesTransport,
} from "../src/features/home/home-help-opportunities-api";
import type { SessionController } from "../src/features/session/session-controller";

const firstSubjectId = "bbde8519-5796-429c-b078-7b705edc5a0b";
const secondSubjectId = "ccde8519-5796-429c-b078-7b705edc5a0b";

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: firstSubjectId,
    unansweredPeerQuestions: 3,
    ...overrides,
  };
}

function subject(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: firstSubjectId,
    subjectName: "Cálculo I",
    state: "current",
    ...overrides,
  };
}

function response(
  opportunities: unknown[] = [opportunity()],
  participations: unknown[] = [subject()],
) {
  return {
    opportunities: { items: opportunities, hasMoreSubjects: false },
    participations: {
      participations,
      truncated: false,
      limit: 100,
    },
  };
}

test("help opportunities join only current owner subjects and expose a minimal projection", () => {
  const result = parseHomeHelpOpportunities(
    {
      items: [
        opportunity({
          unansweredPeerQuestions: 1,
          privateBody: "must not escape",
        }),
        opportunity({
          subjectId: secondSubjectId,
          unansweredPeerQuestions: 4,
          authorUserId: "another-person",
        }),
      ],
      hasMoreSubjects: true,
    },
    {
      participations: [
        subject({ state: "completed" }),
        subject(),
        subject({
          subjectId: secondSubjectId,
          subjectName: "Álgebra",
        }),
      ],
      truncated: true,
      limit: 100,
    },
  );

  assert.deepEqual(result, {
    items: [
      {
        subjectId: secondSubjectId,
        subjectName: "Álgebra",
        unansweredPeerQuestions: 4,
      },
      {
        subjectId: firstSubjectId,
        subjectName: "Cálculo I",
        unansweredPeerQuestions: 1,
      },
    ],
    hasMoreSubjects: true,
  });
  assert.equal("privateBody" in result.items[0]!, false);
});

test("help opportunities reject malformed, duplicate, stale and non-current rows", () => {
  const invalid = [
    [
      {
        items: [opportunity({ subjectId: "invalid" })],
        hasMoreSubjects: false,
      },
      [subject()],
    ],
    [
      {
        items: [opportunity({ unansweredPeerQuestions: -1 })],
        hasMoreSubjects: false,
      },
      [subject()],
    ],
    [
      {
        items: [opportunity(), opportunity()],
        hasMoreSubjects: false,
      },
      [subject()],
    ],
    [
      { items: [opportunity()], hasMoreSubjects: false },
      [subject({ state: "completed" })],
    ],
    [
      { items: [opportunity()], hasMoreSubjects: false },
      [subject({ subjectName: " " })],
    ],
    [{ items: [], hasMoreSubjects: false }, [subject({ state: "unknown" })]],
    [
      { items: [], hasMoreSubjects: false },
      [subject(), subject({ subjectName: "Otro nombre" })],
    ],
    [{ items: [], hasMoreSubjects: "false" }, [subject()]],
    [
      {
        items: Array.from({ length: 13 }, () => opportunity()),
        hasMoreSubjects: false,
      },
      [subject()],
    ],
  ] as const;

  for (const [opportunities, participations] of invalid) {
    assert.throws(
      () =>
        parseHomeHelpOpportunities(opportunities, {
          participations,
          truncated: false,
          limit: 100,
        }),
      (error: unknown) =>
        error instanceof ApiRequestError &&
        error.code === "QA_HELP_OPPORTUNITIES_UNAVAILABLE",
    );
  }
});

test("help opportunities transport uses the session credential for both owner reads", async () => {
  const calls: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      calls.push(["request", ...args]);
      return { items: [], hasMoreSubjects: false };
    },
    academicSubjects: async (...args: unknown[]) => {
      calls.push(["academicSubjects", ...args]);
      return { participations: [], truncated: false, limit: 100 };
    },
  };
  const transport = new HomeHelpOpportunitiesHttpTransport(client as never);

  await Promise.all([
    transport.opportunities("session-token"),
    transport.subjectParticipations("session-token"),
  ]);

  assert.deepEqual(calls, [
    ["request", "/qa/me/help-opportunities", { credential: "session-token" }],
    ["academicSubjects", "session-token", undefined, undefined],
  ]);
});

test("help opportunities API fences the owner session before returning data", async () => {
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
  const values = response();
  const transport: HomeHelpOpportunitiesTransport = {
    opportunities: async () => values.opportunities,
    subjectParticipations: async () => values.participations,
  };
  const api = new MobileHomeHelpOpportunitiesApi(session, transport);

  assert.deepEqual(await api.list(), {
    items: [
      {
        subjectId: firstSubjectId,
        subjectName: "Cálculo I",
        unansweredPeerQuestions: 3,
      },
    ],
    hasMoreSubjects: false,
  });

  authoritative = false;
  await assert.rejects(
    api.list(),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(invalidated, 1);
});
