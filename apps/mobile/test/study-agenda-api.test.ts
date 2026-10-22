import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRequestError,
  type MobileApiClient,
} from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import {
  MobileStudyAgendaApi,
  StudyAgendaHttpTransport,
  type StudyAgenda,
  type StudyAgendaTransport,
} from "../src/features/study/study-agenda-api";

const agenda: StudyAgenda = { scheduled: [], unscheduled: [] };

function sessionStub(overrides: Record<string, unknown> = {}) {
  return {
    getCredentialSnapshot: () => ({
      credential: "current-token",
      generation: 7,
    }),
    isCredentialAuthoritative: () => true,
    invalidateIfAuthoritative: async () => undefined,
    restrictIfAuthoritative: async () => undefined,
    ...overrides,
  } as unknown as SessionController;
}

test("agenda transport uses only the authenticated private endpoint", async () => {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  const client = {
    request: async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return agenda;
    },
  } as unknown as MobileApiClient;
  const signal = new AbortController().signal;
  const transport = new StudyAgendaHttpTransport(client);
  await transport.get("current-token", signal);
  assert.deepEqual(calls, [
    {
      path: "/study-progress/me/agenda",
      options: { credential: "current-token", signal },
    },
  ]);
});

test("missing credentials reject without reading the agenda", async () => {
  let calls = 0;
  const transport: StudyAgendaTransport = {
    get: async () => {
      calls += 1;
      return agenda;
    },
  };
  const api = new MobileStudyAgendaApi(
    sessionStub({ getCredentialSnapshot: () => null }),
    transport,
  );
  await assert.rejects(api.get(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, "AUTHENTICATION_REQUIRED");
    return true;
  });
  assert.equal(calls, 0);
});

test("late agenda responses are rejected after credential authority changes", async () => {
  const transport: StudyAgendaTransport = { get: async () => agenda };
  const api = new MobileStudyAgendaApi(
    sessionStub({ isCredentialAuthoritative: () => false }),
    transport,
  );
  await assert.rejects(api.get(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, "STALE_SESSION_AUTHORITY");
    return true;
  });
});
