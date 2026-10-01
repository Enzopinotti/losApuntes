import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcademicAffiliationListResponse,
  AcademicCurrentContextResponse,
  AcademicSubjectParticipationListResponse,
  SetAcademicContextInput,
} from "@losapuntes/contracts";

import type { AcademicContextApi } from "../src/features/academic/academic-api";
import { AcademicContextController } from "../src/features/academic/academic-context-controller";
import { ApiRequestError } from "../src/services/api/client";

const affiliations: AcademicAffiliationListResponse = {
  affiliations: [
    {
      id: "aff-a",
      institutionId: "inst-a",
      programId: "program-a",
      status: "active",
      roles: ["student"],
      startedOn: "2024",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "aff-b",
      institutionId: "inst-b",
      status: "completed",
      roles: ["alumni"],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  truncated: false,
  limit: 50,
};

const subjects: AcademicSubjectParticipationListResponse = {
  participations: [
    {
      id: "part-a",
      subjectId: "subject-a",
      state: "current",
      periodLabel: "2026 S2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  truncated: false,
  limit: 100,
};

const context = (
  affiliationId = "aff-a",
  subjectParticipationId: string | undefined = "part-a",
): AcademicCurrentContextResponse => ({
  context: {
    affiliationId,
    ...(subjectParticipationId ? { subjectParticipationId } : {}),
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
});

const api = (
  overrides: Partial<AcademicContextApi> = {},
): AcademicContextApi => ({
  affiliations: async () => affiliations,
  subjects: async () => subjects,
  context: async () => context(),
  setContext: async (input: SetAcademicContextInput) =>
    context(input.affiliationId, input.subjectParticipationId),
  ...overrides,
});

test("bootstraps context and bounded inventories from server authority", async () => {
  const controller = new AcademicContextController(api());

  await controller.restore("user-1:session-1");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");

  assert.equal(snapshot.data.context?.affiliationId, "aff-a");
  assert.equal(snapshot.data.affiliations.length, 2);
  assert.equal(snapshot.data.participations.length, 1);
  assert.equal(snapshot.data.contextRevision, 1);
  assert.equal(
    snapshot.data.contextAuthorityKey,
    "user-1:session-1:1",
  );
});

test("represents missing context explicitly without inventing one", async () => {
  const controller = new AcademicContextController(
    api({ context: async () => ({ context: null }) }),
  );

  await controller.restore("user-1:session-1");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "no_context");
  if (snapshot.kind !== "no_context") throw new Error("expected no_context");
  assert.equal(snapshot.data.context, null);
});

test("an old authority restore cannot overwrite a newer session", async () => {
  let resolveOld!: (value: AcademicCurrentContextResponse) => void;
  const oldContext = new Promise<AcademicCurrentContextResponse>((resolve) => {
    resolveOld = resolve;
  });
  let contextCalls = 0;

  const controller = new AcademicContextController(
    api({
      context: async () => {
        contextCalls += 1;
        if (contextCalls === 1) return oldContext;
        return context("aff-b", undefined);
      },
    }),
  );

  const oldRestore = controller.restore("user-1:session-old");
  await Promise.resolve();
  await controller.restore("user-1:session-new");
  resolveOld(context("aff-a"));
  await oldRestore;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-b");
  assert.match(snapshot.data.contextAuthorityKey, /^user-1:session-new:/u);
});

test("a stale context switch cannot overwrite the latest selection", async () => {
  let resolveFirst!: (value: AcademicCurrentContextResponse) => void;
  const firstSwitch = new Promise<AcademicCurrentContextResponse>((resolve) => {
    resolveFirst = resolve;
  });
  let calls = 0;

  const controller = new AcademicContextController(
    api({
      setContext: async (input) => {
        calls += 1;
        if (calls === 1) return firstSwitch;
        return context(input.affiliationId, undefined);
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const first = controller.selectAffiliation("user-1:session-1", "aff-a");
  await Promise.resolve();
  await controller.selectAffiliation("user-1:session-1", "aff-b");
  resolveFirst(context("aff-a", undefined));
  await first;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-b");
  assert.equal(snapshot.data.contextRevision, 2);
});

test("ambiguous switch failure stops exposing the previous context as authority", async () => {
  const controller = new AcademicContextController(
    api({
      setContext: async () => {
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "timeout",
        );
      },
    }),
  );

  await controller.restore("user-1:session-1");
  await controller.selectAffiliation("user-1:session-1", "aff-b");

  assert.equal(controller.getSnapshot().kind, "timeout");
});

test("suspending invalidates in-flight context ownership", async () => {
  let resolveContext!: (value: AcademicCurrentContextResponse) => void;
  const pendingContext = new Promise<AcademicCurrentContextResponse>(
    (resolve) => {
      resolveContext = resolve;
    },
  );
  const controller = new AcademicContextController(
    api({ context: async () => pendingContext }),
  );

  const restore = controller.restore("user-1:session-1");
  await Promise.resolve();
  controller.suspend();
  resolveContext(context("aff-b", undefined));
  await restore;

  assert.equal(controller.getSnapshot().kind, "loading");
});
