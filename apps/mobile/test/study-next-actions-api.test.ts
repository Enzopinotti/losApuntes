import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRequestError,
  type MobileApiClient,
} from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import {
  MobileStudyNextActionsApi,
  StudyNextActionsHttpTransport,
  type StudyNextActions,
  type StudyNextActionsTransport,
} from "../src/features/study/study-next-actions-api";

const actions: StudyNextActions = {
  items: [],
  summary: {
    totalPlans: 0,
    actionablePlans: 0,
    completedPlans: 0,
    emptyPlans: 0,
  },
};

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

test("transport reads only the authenticated private next-actions endpoint", async () => {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  const client = {
    request: async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return actions;
    },
  } as unknown as MobileApiClient;
  const signal = new AbortController().signal;
  const transport = new StudyNextActionsHttpTransport(client);
  await transport.get("current-token", signal);
  assert.deepEqual(calls, [
    {
      path: "/study-progress/me/next-actions",
      options: { credential: "current-token", signal },
    },
  ]);
});

test("missing credentials reject without reading next actions", async () => {
  let calls = 0;
  const transport: StudyNextActionsTransport = {
    get: async () => {
      calls += 1;
      return actions;
    },
  };
  const api = new MobileStudyNextActionsApi(
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

test("late responses reject after the credential authority changes", async () => {
  const transport: StudyNextActionsTransport = { get: async () => actions };
  const api = new MobileStudyNextActionsApi(
    sessionStub({ isCredentialAuthoritative: () => false }),
    transport,
  );
  await assert.rejects(api.get(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, "STALE_SESSION_AUTHORITY");
    return true;
  });
});
