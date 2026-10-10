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
      subjectName: "Álgebra",
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
    revision: 1,
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
});

const contextWithoutSubject = (
  affiliationId = "aff-a",
): AcademicCurrentContextResponse => ({
  context: {
    affiliationId,
    revision: 1,
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
});

const api = (
  overrides: Partial<AcademicContextApi> = {},
): AcademicContextApi => ({
  catalogSearch: async () => ({ items: [], nextCursor: null }),
  affiliations: async () => affiliations,
  createAffiliation: async (input) => ({
    affiliation: {
      id: "aff-created",
      institutionId: input.institutionId,
      status: input.status,
      roles: input.roles ?? ["student"],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  }),
  subjects: async () => subjects,
  context: async () => context(),
  setContext: async (input: SetAcademicContextInput) =>
    context(input.affiliationId, input.subjectParticipationId),
  upsertSubjectParticipation: async (subjectId, input) => ({
    participation: {
      id: "part-created",
      subjectId,
      subjectName: subjectId,
      state: input.state,
      createdAt: "2026-10-10T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
    },
  }),
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
  assert.equal(snapshot.data.contextAuthorityKey, "user-1:session-1:1");
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

test("serializes affiliation writes and advances the server revision", async () => {
  let resolveFirst!: (value: AcademicCurrentContextResponse) => void;
  const firstSwitch = new Promise<AcademicCurrentContextResponse>((resolve) => {
    resolveFirst = resolve;
  });
  const calls: SetAcademicContextInput[] = [];

  const controller = new AcademicContextController(
    api({
      context: async () => contextWithoutSubject(),
      setContext: async (input) => {
        calls.push(input);
        if (calls.length === 1) return firstSwitch;
        return {
          context: {
            ...contextWithoutSubject(input.affiliationId).context!,
            revision: input.expectedRevision + 1,
          },
        };
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const first = controller.selectAffiliation("user-1:session-1", "aff-b");
  await Promise.resolve();
  const second = controller.selectAffiliation("user-1:session-1", "aff-a");
  await Promise.resolve();

  assert.equal(calls.length, 1);
  resolveFirst({
    context: {
      ...contextWithoutSubject("aff-b").context!,
      revision: 2,
    },
  });

  await first;
  await second;

  assert.deepEqual(calls[1], {
    affiliationId: "aff-a",
    expectedRevision: 2,
  });

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-a");
  assert.equal(snapshot.data.context?.revision, 3);
});

test("ambiguous switch failure re-reads server authority before settling", async () => {
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

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-a");
  assert.equal(snapshot.data.context?.subjectParticipationId, "part-a");
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

test("selects and clears subject context through the current affiliation", async () => {
  const calls: SetAcademicContextInput[] = [];
  const controller = new AcademicContextController(
    api({
      context: async () => contextWithoutSubject(),
      setContext: async (input) => {
        calls.push(input);
        return "subjectParticipationId" in input
          ? {
              context: {
                ...context(input.affiliationId, input.subjectParticipationId)
                  .context!,
                revision: input.expectedRevision + 1,
              },
            }
          : {
              context: {
                ...contextWithoutSubject(input.affiliationId).context!,
                revision: input.expectedRevision + 1,
              },
            };
      },
    }),
  );

  await controller.restore("user-1:session-1");
  await controller.selectSubject("user-1:session-1", "part-a");

  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.subjectParticipationId, "part-a");
  assert.deepEqual(calls[0], {
    affiliationId: "aff-a",
    subjectParticipationId: "part-a",
    expectedRevision: 1,
  });

  await controller.selectSubject("user-1:session-1", null);

  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.subjectParticipationId, undefined);
  assert.deepEqual(calls[1], {
    affiliationId: "aff-a",
    expectedRevision: 2,
  });
  assert.equal(snapshot.data.contextRevision, 3);
});

test("serializes subject writes so the latest selection reaches the server last", async () => {
  let resolveFirst!: (value: AcademicCurrentContextResponse) => void;
  const firstSwitch = new Promise<AcademicCurrentContextResponse>((resolve) => {
    resolveFirst = resolve;
  });
  const calls: SetAcademicContextInput[] = [];

  const controller = new AcademicContextController(
    api({
      context: async () => contextWithoutSubject(),
      setContext: async (input) => {
        calls.push(input);
        if (calls.length === 1) return firstSwitch;
        return {
          context: {
            ...context(input.affiliationId, input.subjectParticipationId)
              .context!,
            revision: input.expectedRevision + 1,
          },
        };
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const first = controller.selectSubject("user-1:session-1", "part-a");
  await Promise.resolve();
  const second = controller.selectSubject("user-1:session-1", "part-b");
  await Promise.resolve();

  assert.equal(calls.length, 1);
  resolveFirst({
    context: {
      ...context("aff-a", "part-a").context!,
      revision: 2,
    },
  });

  await first;
  await second;

  assert.deepEqual(calls[1], {
    affiliationId: "aff-a",
    subjectParticipationId: "part-b",
    expectedRevision: 2,
  });

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.subjectParticipationId, "part-b");
  assert.equal(snapshot.data.context?.revision, 3);
  assert.equal(snapshot.data.contextRevision, 3);
});

test("restores and refreshes subject choices using server affiliation scope", async () => {
  const subjectScopes: Array<string | undefined> = [];
  const scopedB: AcademicSubjectParticipationListResponse = {
    participations: [],
    truncated: false,
    limit: 100,
  };
  const controller = new AcademicContextController(
    api({
      context: async () => contextWithoutSubject("aff-a"),
      subjects: async (affiliationId) => {
        subjectScopes.push(affiliationId);
        return affiliationId === "aff-b" ? scopedB : subjects;
      },
      setContext: async (input) => ({
        context: {
          ...contextWithoutSubject(input.affiliationId).context!,
          revision: input.expectedRevision + 1,
        },
      }),
    }),
  );

  await controller.restore("user-1:session-1");
  await controller.selectAffiliation("user-1:session-1", "aff-b");

  assert.deepEqual(subjectScopes, ["aff-a", "aff-b"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-b");
  assert.deepEqual(snapshot.data.participations, []);
});

test("reconciles an ambiguous write before draining the next queued selection", async () => {
  const calls: SetAcademicContextInput[] = [];
  let rejectFirst!: (reason: unknown) => void;
  const firstWrite = new Promise<AcademicCurrentContextResponse>(
    (_resolve, reject) => {
      rejectFirst = reject;
    },
  );
  let serverContext: AcademicCurrentContextResponse = contextWithoutSubject();

  const controller = new AcademicContextController(
    api({
      context: async () => serverContext,
      setContext: async (input) => {
        calls.push(input);
        if (calls.length === 1) return firstWrite;

        serverContext = {
          context: {
            ...context(input.affiliationId, input.subjectParticipationId)
              .context!,
            revision: input.expectedRevision + 1,
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const first = controller.selectSubject("user-1:session-1", "part-a");
  await Promise.resolve();
  const second = controller.selectSubject("user-1:session-1", "part-b");
  await Promise.resolve();

  serverContext = {
    context: {
      ...context("aff-a", "part-a").context!,
      revision: 2,
    },
  };
  rejectFirst(
    new ApiRequestError(
      "timeout",
      null,
      "REQUEST_TIMEOUT",
      "timeout after commit",
    ),
  );

  await first;
  await second;

  assert.deepEqual(calls[1], {
    affiliationId: "aff-a",
    subjectParticipationId: "part-b",
    expectedRevision: 2,
  });
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.subjectParticipationId, "part-b");
  assert.equal(snapshot.data.context?.revision, 3);
});

test("keeps a queued selection pending until failed reconciliation recovers authority", async () => {
  const calls: SetAcademicContextInput[] = [];
  let rejectFirst!: (reason: unknown) => void;
  const firstWrite = new Promise<AcademicCurrentContextResponse>(
    (_resolve, reject) => {
      rejectFirst = reject;
    },
  );
  let serverContext: AcademicCurrentContextResponse = contextWithoutSubject();
  let contextReads = 0;
  let online = true;

  const controller = new AcademicContextController(
    api({
      context: async () => {
        contextReads += 1;
        if (contextReads === 1 || online) return serverContext;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "reconciliation unavailable",
        );
      },
      setContext: async (input) => {
        calls.push(input);
        if (calls.length === 1) return firstWrite;

        serverContext = {
          context: {
            ...context(input.affiliationId, input.subjectParticipationId)
              .context!,
            revision: input.expectedRevision + 1,
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const first = controller.selectSubject("user-1:session-1", "part-a");
  await Promise.resolve();
  const second = controller.selectSubject("user-1:session-1", "part-b");
  let secondSettled = false;
  void second.then(() => {
    secondSettled = true;
  });

  serverContext = {
    context: {
      ...context("aff-a", "part-a").context!,
      revision: 2,
    },
  };
  online = false;
  rejectFirst(
    new ApiRequestError(
      "timeout",
      null,
      "REQUEST_TIMEOUT",
      "timeout after commit",
    ),
  );

  await first;
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }

  assert.equal(calls.length, 1);
  assert.equal(secondSettled, false);
  assert.notEqual(controller.getSnapshot().kind, "ready");

  online = true;
  await controller.restore("user-1:session-1");
  await second;

  assert.deepEqual(calls[1], {
    affiliationId: "aff-a",
    subjectParticipationId: "part-b",
    expectedRevision: 2,
  });
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.subjectParticipationId, "part-b");
  assert.equal(snapshot.data.context?.revision, 3);
});

test("creates an institutional affiliation and selects it from fresh server authority", async () => {
  const createdAffiliation = {
    id: "aff-new",
    institutionId: "inst-new",
    status: "active" as const,
    roles: ["student" as const],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  let storedAffiliation = false;
  let serverContext: AcademicCurrentContextResponse = { context: null };
  let createCalls = 0;
  const writes: SetAcademicContextInput[] = [];
  const controller = new AcademicContextController(
    api({
      affiliations: async () => ({
        affiliations: storedAffiliation ? [createdAffiliation] : [],
        truncated: false,
        limit: 50,
      }),
      subjects: async () => ({
        participations: [],
        truncated: false,
        limit: 100,
      }),
      context: async () => serverContext,
      createAffiliation: async (input) => {
        createCalls += 1;
        assert.deepEqual(input, {
          institutionId: "inst-new",
          status: "active",
        });
        storedAffiliation = true;
        return { affiliation: createdAffiliation };
      },
      setContext: async (input) => {
        writes.push(input);
        serverContext = {
          context: {
            affiliationId: input.affiliationId,
            revision: input.expectedRevision + 1,
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addInstitutionAffiliation(
    "user-1:session-1",
    "inst-new",
  );

  assert.deepEqual(result, {
    kind: "selected",
    affiliation: createdAffiliation,
  });
  assert.equal(createCalls, 1);
  assert.deepEqual(writes, [{ affiliationId: "aff-new", expectedRevision: 0 }]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-new");
});

test("creates a program-scoped affiliation without reusing an institution-only one", async () => {
  const existingInstitutionAffiliation = {
    id: "aff-institution-only",
    institutionId: "inst-new",
    status: "active" as const,
    roles: ["student" as const],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const programAffiliation = {
    id: "aff-program",
    institutionId: "inst-new",
    programId: "program-new",
    status: "active" as const,
    roles: ["student" as const],
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
  let storedAffiliation = false;
  let serverContext: AcademicCurrentContextResponse = { context: null };
  let createdInput: unknown;
  const controller = new AcademicContextController(
    api({
      affiliations: async () => ({
        affiliations: storedAffiliation
          ? [existingInstitutionAffiliation, programAffiliation]
          : [existingInstitutionAffiliation],
        truncated: false,
        limit: 50,
      }),
      subjects: async () => ({
        participations: [],
        truncated: false,
        limit: 100,
      }),
      context: async () => serverContext,
      createAffiliation: async (input) => {
        createdInput = input;
        storedAffiliation = true;
        return { affiliation: programAffiliation };
      },
      setContext: async (input) => {
        serverContext = {
          context: {
            affiliationId: input.affiliationId,
            revision: input.expectedRevision + 1,
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addInstitutionAffiliation(
    "user-1:session-1",
    "inst-new",
    "program-new",
  );

  assert.deepEqual(result, {
    kind: "selected",
    affiliation: programAffiliation,
  });
  assert.deepEqual(createdInput, {
    institutionId: "inst-new",
    programId: "program-new",
    status: "active",
  });
  assert.equal(serverContext.context?.affiliationId, "aff-program");
});

test("adds a current subject and selects it with the latest server context revision", async () => {
  const created = {
    id: "part-new",
    subjectId: "subject-new",
    subjectName: "Física I",
    state: "current" as const,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
  let serverContext = context("aff-a");
  let write: SetAcademicContextInput | null = null;
  let storedSubjects: AcademicSubjectParticipationListResponse = subjects;
  const controller = new AcademicContextController(
    api({
      subjects: async () => storedSubjects,
      context: async () => serverContext,
      upsertSubjectParticipation: async (subjectId, input) => {
        assert.equal(subjectId, "subject-new");
        assert.equal(input.state, "current");
        storedSubjects = {
          participations: [...subjects.participations, created],
          truncated: false,
          limit: 100,
        };
        return { participation: created };
      },
      setContext: async (input) => {
        write = input;
        serverContext = {
          context: {
            affiliationId: input.affiliationId,
            ...(input.subjectParticipationId
              ? { subjectParticipationId: input.subjectParticipationId }
              : {}),
            revision: input.expectedRevision + 1,
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addSubjectParticipation(
    "user-1:session-1",
    "aff-a",
    "subject-new",
    "current",
  );

  assert.deepEqual(result, {
    kind: "added",
    participation: created,
    usedAsCurrentContext: true,
  });
  assert.deepEqual(write, {
    affiliationId: "aff-a",
    subjectParticipationId: "part-new",
    expectedRevision: 1,
  });
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.subjectParticipationId, "part-new");
});

test("reconciles an ambiguous current-subject upsert before selecting its context", async () => {
  const created = {
    id: "part-new",
    subjectId: "subject-new",
    subjectName: "Física I",
    state: "current" as const,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
  let serverContext = context("aff-a");
  let storedSubjects: AcademicSubjectParticipationListResponse = subjects;
  let upsertCalls = 0;
  const controller = new AcademicContextController(
    api({
      subjects: async () => storedSubjects,
      context: async () => serverContext,
      upsertSubjectParticipation: async () => {
        upsertCalls += 1;
        storedSubjects = {
          participations: [...subjects.participations, created],
          truncated: false,
          limit: 100,
        };
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "The server committed before the response timed out",
        );
      },
      setContext: async (input) => {
        serverContext = {
          context: {
            affiliationId: input.affiliationId,
            ...(input.subjectParticipationId
              ? { subjectParticipationId: input.subjectParticipationId }
              : {}),
            revision: input.expectedRevision + 1,
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addSubjectParticipation(
    "user-1:session-1",
    "aff-a",
    "subject-new",
    "current",
  );

  assert.deepEqual(result, {
    kind: "added",
    participation: created,
    usedAsCurrentContext: true,
  });
  assert.equal(upsertCalls, 1);
  assert.equal(serverContext.context?.subjectParticipationId, "part-new");
});

test("does not upsert a subject when fresh context authority changed", async () => {
  let upsertCalls = 0;
  const controller = new AcademicContextController(
    api({
      context: async () => context("aff-b"),
      upsertSubjectParticipation: async () => {
        upsertCalls += 1;
        return {
          participation: {
            id: "part-new",
            subjectId: "subject-new",
            subjectName: "Física I",
            state: "current",
            createdAt: "2026-10-10T00:00:00.000Z",
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addSubjectParticipation(
    "user-1:session-1",
    "aff-a",
    "subject-new",
    "current",
  );

  assert.deepEqual(result, { kind: "reconcile" });
  assert.equal(upsertCalls, 0);
});

test("restores an actionable context snapshot after a rejected subject upsert", async () => {
  const controller = new AcademicContextController(
    api({
      upsertSubjectParticipation: async () => {
        throw new ApiRequestError(
          "validation",
          422,
          "ACADEMIC_CONTEXT_INELIGIBLE",
          "The server rejected this subject for the current affiliation",
        );
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addSubjectParticipation(
    "user-1:session-1",
    "aff-a",
    "subject-new",
    "current",
  );

  assert.deepEqual(result, {
    kind: "failed",
    failure: "validation",
    code: "ACADEMIC_CONTEXT_INELIGIBLE",
  });
  assert.equal(controller.getSnapshot().kind, "ready");
});

test("adds a planned subject without changing the current academic context", async () => {
  const planned = {
    id: "part-planned",
    subjectId: "subject-next",
    subjectName: "Análisis II",
    state: "planned" as const,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
  let serverContext = context("aff-a");
  let setContextCalls = 0;
  const controller = new AcademicContextController(
    api({
      context: async () => serverContext,
      upsertSubjectParticipation: async (subjectId, input) => {
        assert.equal(subjectId, "subject-next");
        assert.equal(input.state, "planned");
        return { participation: planned };
      },
      setContext: async () => {
        setContextCalls += 1;
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addSubjectParticipation(
    "user-1:session-1",
    "aff-a",
    "subject-next",
    "planned",
  );

  assert.deepEqual(result, {
    kind: "added",
    participation: planned,
    usedAsCurrentContext: false,
  });
  assert.equal(setContextCalls, 0);
  assert.equal(serverContext.context?.subjectParticipationId, "part-a");
});

test("reconciles a committed affiliation after an ambiguous create response", async () => {
  const createdAffiliation = {
    id: "aff-new",
    institutionId: "inst-new",
    status: "active" as const,
    roles: ["student" as const],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  let storedAffiliation = false;
  let serverContext: AcademicCurrentContextResponse = { context: null };
  let createCalls = 0;
  const controller = new AcademicContextController(
    api({
      affiliations: async () => ({
        affiliations: storedAffiliation ? [createdAffiliation] : [],
        truncated: false,
        limit: 50,
      }),
      subjects: async () => ({
        participations: [],
        truncated: false,
        limit: 100,
      }),
      context: async () => serverContext,
      createAffiliation: async () => {
        createCalls += 1;
        storedAffiliation = true;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "The server committed before the response timed out",
        );
      },
      setContext: async (input) => {
        serverContext = {
          context: {
            affiliationId: input.affiliationId,
            revision: input.expectedRevision + 1,
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addInstitutionAffiliation(
    "user-1:session-1",
    "inst-new",
  );

  assert.equal(result.kind, "selected");
  assert.equal(createCalls, 1);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("expected ready");
  assert.equal(snapshot.data.context?.affiliationId, "aff-new");
});

test("does not retry an ambiguous create while the affiliation inventory is truncated", async () => {
  let createCalls = 0;
  const controller = new AcademicContextController(
    api({
      affiliations: async () => ({
        affiliations: [],
        truncated: createCalls > 0,
        limit: 50,
      }),
      createAffiliation: async () => {
        createCalls += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "ambiguous response",
        );
      },
      context: async () => ({ context: null }),
      subjects: async () => ({
        participations: [],
        truncated: false,
        limit: 100,
      }),
    }),
  );

  await controller.restore("user-1:session-1");
  assert.deepEqual(
    await controller.addInstitutionAffiliation("user-1:session-1", "inst-new"),
    { kind: "reconcile" },
  );
  assert.deepEqual(
    await controller.addInstitutionAffiliation("user-1:session-1", "inst-new"),
    { kind: "reconcile" },
  );
  assert.equal(createCalls, 1);
});

test("reuses an existing active institution affiliation instead of duplicating it", async () => {
  const existingAffiliation = {
    id: "aff-existing",
    institutionId: "inst-existing",
    status: "active" as const,
    roles: ["student" as const],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  let serverContext: AcademicCurrentContextResponse = { context: null };
  let createCalls = 0;
  const controller = new AcademicContextController(
    api({
      affiliations: async () => ({
        affiliations: [existingAffiliation],
        truncated: false,
        limit: 50,
      }),
      context: async () => serverContext,
      createAffiliation: async () => {
        createCalls += 1;
        return { affiliation: existingAffiliation };
      },
      setContext: async (input) => {
        serverContext = {
          context: {
            affiliationId: input.affiliationId,
            revision: input.expectedRevision + 1,
            updatedAt: "2026-10-10T00:00:00.000Z",
          },
        };
        return serverContext;
      },
    }),
  );

  await controller.restore("user-1:session-1");
  const result = await controller.addInstitutionAffiliation(
    "user-1:session-1",
    "inst-existing",
  );

  assert.deepEqual(result, {
    kind: "selected",
    affiliation: existingAffiliation,
  });
  assert.equal(createCalls, 0);
});
