import assert from "node:assert/strict";
import test from "node:test";

import type {
  AnswerView,
  QuestionDetailResponse,
  QuestionView,
} from "@losapuntes/contracts/social-qa";

import type { CommunityQaMutationsApi } from "../src/features/community/community-api";
import {
  canApplyQaMutation,
  MobileQaMutationsController,
} from "../src/features/community/qa-mutations-controller";
import { ApiRequestError } from "../src/services/api/client";

const question = (changes: Partial<QuestionView> = {}): QuestionView => ({
  id: "question-a",
  author: null,
  academic: {
    subject: { id: "subject-a", name: "Análisis" },
    courseOffering: null,
  },
  title: "Una pregunta",
  body: "Una explicación suficientemente larga.",
  state: "open",
  answerCount: 1,
  acceptedAnswerId: null,
  revision: 4,
  viewer: {
    canEdit: true,
    canAnswer: false,
    canAcceptAnswers: true,
    canReport: false,
  },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...changes,
});

const answer = (changes: Partial<AnswerView> = {}): AnswerView => ({
  id: "answer-a",
  questionId: "question-a",
  author: null,
  body: "Explicación útil.",
  revision: 2,
  viewer: { canEdit: true, canReport: false },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...changes,
});

const detail = (
  q: QuestionView = question(),
  answers: AnswerView[] = [answer()],
): QuestionDetailResponse => ({
  question: q,
  answers,
  answersNextCursor: null,
  answersLimit: 25,
});

function stubApi(
  changes: Partial<CommunityQaMutationsApi> = {},
): CommunityQaMutationsApi {
  return {
    question: async () => detail(),
    updateQuestion: async (_id, input) => ({
      question: question({ revision: input.expectedRevision + 1 }),
    }),
    updateAnswer: async (_id, input) => ({
      answer: answer({ revision: input.expectedRevision + 1 }),
    }),
    acceptAnswer: async (_id, answerId, revision) => ({
      question: question({
        revision: revision + 1,
        acceptedAnswerId: answerId,
      }),
    }),
    ...changes,
  };
}

test("mutation permissions are driven by server viewer flags and actual answer membership", () => {
  const forbidden = detail(
    question({
      viewer: {
        canEdit: false,
        canAnswer: true,
        canAcceptAnswers: false,
        canReport: true,
      },
    }),
    [answer({ viewer: { canEdit: false, canReport: true } })],
  );
  assert.equal(
    canApplyQaMutation(forbidden, {
      kind: "edit-question",
      title: "Un nuevo título",
      body: "Un cuerpo corregido y válido.",
    }),
    false,
  );
  assert.equal(
    canApplyQaMutation(forbidden, {
      kind: "set-question-state",
      state: "closed",
    }),
    false,
  );
  assert.equal(
    canApplyQaMutation(forbidden, {
      kind: "edit-answer",
      answerId: "answer-a",
      body: "Texto nuevo",
    }),
    false,
  );
  assert.equal(
    canApplyQaMutation(forbidden, {
      kind: "accept-answer",
      answerId: "answer-a",
    }),
    false,
  );
  assert.equal(
    canApplyQaMutation(detail(), {
      kind: "accept-answer",
      answerId: "answer-from-another-question",
    }),
    false,
  );
});

test("question editing sends the observed revision and normalized fields", async () => {
  const received: unknown[] = [];
  const controller = new MobileQaMutationsController(
    stubApi({
      updateQuestion: async (id, input) => {
        received.push({ id, input });
        return { question: question({ revision: 5 }) };
      },
    }),
  );
  assert.equal(
    await controller.apply("scope-a", detail(), {
      kind: "edit-question",
      title: "  Nuevo título  ",
      body: "  Una nueva explicación extensa.  ",
    }),
    true,
  );
  assert.deepEqual(received, [
    {
      id: "question-a",
      input: {
        expectedRevision: 4,
        title: "Nuevo título",
        body: "Una nueva explicación extensa.",
      },
    },
  ]);
  assert.equal(controller.getSnapshot().kind, "success");
});

test("closing and reopening carry the latest server revision", async () => {
  const seen: number[] = [];
  const controller = new MobileQaMutationsController(
    stubApi({
      updateQuestion: async (_id, input) => {
        seen.push(input.expectedRevision);
        return {
          question: question({
            state: input.status ?? "open",
            revision: input.expectedRevision + 1,
          }),
        };
      },
    }),
  );
  assert.equal(
    await controller.apply("scope-a", detail(), {
      kind: "set-question-state",
      state: "closed",
    }),
    true,
  );
  assert.equal(
    await controller.apply(
      "scope-a",
      detail(question({ state: "closed", revision: 5 })),
      { kind: "set-question-state", state: "open" },
    ),
    true,
  );
  assert.deepEqual(seen, [4, 5]);
});

test("editing an answer and accepting it use their respective revisions", async () => {
  const seen: unknown[] = [];
  const controller = new MobileQaMutationsController(
    stubApi({
      updateAnswer: async (id, input) => {
        seen.push({ id, input });
        return { answer: answer({ body: input.body, revision: 3 }) };
      },
      acceptAnswer: async (id, answerId, revision) => {
        seen.push({ id, answerId, revision });
        return {
          question: question({ acceptedAnswerId: answerId, revision: 5 }),
        };
      },
    }),
  );
  assert.equal(
    await controller.apply("scope-a", detail(), {
      kind: "edit-answer",
      answerId: "answer-a",
      body: "  Una respuesta más clara.  ",
    }),
    true,
  );
  assert.equal(
    await controller.apply("scope-a", detail(), {
      kind: "accept-answer",
      answerId: "answer-a",
    }),
    true,
  );
  assert.deepEqual(seen, [
    {
      id: "answer-a",
      input: { expectedRevision: 2, body: "Una respuesta más clara." },
    },
    { id: "question-a", answerId: "answer-a", revision: 4 },
  ]);
});

test("revision conflicts require a refresh instead of silently overwriting", async () => {
  let writes = 0;
  const controller = new MobileQaMutationsController(
    stubApi({
      updateQuestion: async () => {
        writes += 1;
        throw new ApiRequestError(
          "conflict",
          409,
          "QUESTION_REVISION_CONFLICT",
          "Revision conflict",
        );
      },
    }),
  );
  const change = { kind: "set-question-state", state: "closed" } as const;
  assert.equal(await controller.apply("scope-a", detail(), change), false);
  assert.equal(controller.getSnapshot().kind, "failure");
  assert.equal(await controller.apply("scope-a", detail(), change), false);
  assert.equal(writes, 1);
  controller.invalidate();
  assert.equal(controller.getSnapshot().kind, "idle");
});

test("a timed-out mutation is reconciled from fresh server state without a second POST", async () => {
  let writes = 0;
  const controller = new MobileQaMutationsController(
    stubApi({
      acceptAnswer: async () => {
        writes += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "Timeout",
        );
      },
      question: async () =>
        detail(question({ revision: 5, acceptedAnswerId: "answer-a" })),
    }),
  );
  assert.equal(
    await controller.apply("scope-a", detail(), {
      kind: "accept-answer",
      answerId: "answer-a",
    }),
    true,
  );
  assert.equal(writes, 1);
  assert.equal(controller.getSnapshot().kind, "success");
});

test("unconfirmed network mutations stay blocked until revalidation", async () => {
  let writes = 0;
  const controller = new MobileQaMutationsController(
    stubApi({
      updateQuestion: async () => {
        writes += 1;
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "Offline",
        );
      },
      question: async () => detail(),
    }),
  );
  const action = { kind: "set-question-state", state: "closed" } as const;
  assert.equal(await controller.apply("scope-a", detail(), action), false);
  assert.equal(controller.getSnapshot().kind, "uncertain");
  assert.equal(await controller.apply("scope-a", detail(), action), false);
  assert.equal(writes, 1);
});

test("authority invalidation aborts mutation and discards its late result", async () => {
  let resolve!: (value: { question: QuestionView }) => void;
  let signal: AbortSignal | undefined;
  const delayed = new Promise<{ question: QuestionView }>((done) => {
    resolve = done;
  });
  const controller = new MobileQaMutationsController(
    stubApi({
      updateQuestion: async (_id, _input, requestSignal) => {
        signal = requestSignal;
        return delayed;
      },
    }),
  );
  const pending = controller.apply("scope-a", detail(), {
    kind: "set-question-state",
    state: "closed",
  });
  controller.invalidate();
  resolve({ question: question({ state: "closed", revision: 5 }) });
  assert.equal(await pending, false);
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});
