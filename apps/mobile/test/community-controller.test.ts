import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcademicCurrentContext,
  AcademicSubjectParticipation,
} from "@losapuntes/contracts";
import type {
  AnswerView,
  QuestionDetailResponse,
  QuestionSearchResponse,
  QuestionView,
} from "@losapuntes/contracts/social-qa";

import type { CommunityApi } from "../src/features/community/community-api";
import {
  captureOwnedQuestionBaseline,
  cancelCommunityComposerSubmission,
  communityQuestionRouteGate,
  MobileCommunityFeedController,
  MobileCommunityQuestionController,
  reconcileQuestionCreation,
  resolveQuestionScope,
} from "../src/features/community/community-controller";
import { ApiRequestError } from "../src/services/api/client";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const question = (id: string): QuestionView => ({
  id,
  author: {
    profileId: `profile-${id}`,
    displayName: `Autor ${id}`,
    avatarUrl: null,
  },
  academic: {
    subject: { id: "subject-a", name: "Álgebra" },
    courseOffering: null,
  },
  title: `Pregunta ${id}`,
  body: "Una consulta académica con suficiente detalle.",
  state: "open",
  answerCount: 0,
  acceptedAnswerId: null,
  revision: 1,
  viewer: {
    canEdit: false,
    canAnswer: true,
    canAcceptAnswers: false,
    canReport: true,
  },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const answer = (id: string): AnswerView => ({
  id,
  questionId: "question-a",
  author: {
    profileId: `profile-${id}`,
    displayName: `Autor ${id}`,
    avatarUrl: null,
  },
  body: `Respuesta ${id}`,
  revision: 1,
  viewer: { canEdit: false, canReport: true },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const detail = (
  id: string,
  answers: AnswerView[] = [],
  answersNextCursor: string | null = null,
): QuestionDetailResponse => ({
  question: question(id),
  answers,
  answersNextCursor,
  answersLimit: 25,
});

const page = (
  items: QuestionView[],
  nextCursor: string | null = null,
): QuestionSearchResponse => ({ items, nextCursor });

test("maps the active subject participation to its canonical subject filter", () => {
  const context: AcademicCurrentContext = {
    affiliationId: "aff-a",
    subjectParticipationId: "part-a",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const participation: AcademicSubjectParticipation = {
    id: "part-a",
    subjectId: "subject-a",
    courseOfferingId: "offering-a",
    state: "current",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  assert.deepEqual(resolveQuestionScope(context, [participation]), {
    kind: "subject",
    participation,
    subjectId: "subject-a",
  });
  assert.deepEqual(resolveQuestionScope(null, [participation]), {
    kind: "all",
  });
  assert.deepEqual(resolveQuestionScope(context, []), { kind: "unresolved" });
});

test("a late feed response from a previous context cannot replace current questions", async () => {
  const first = deferred<QuestionSearchResponse>();
  const second = deferred<QuestionSearchResponse>();
  let calls = 0;
  const api: CommunityApi = {
    questions: async () => (++calls === 1 ? first.promise : second.promise),
    question: async (id) => detail(id),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => ({ answer: answer("created") }),
  };
  const controller = new MobileCommunityFeedController(api);

  const oldLoad = controller.load("authority-a", { subjectId: "subject-a" });
  const newLoad = controller.load("authority-b", { subjectId: "subject-b" });
  second.resolve(page([question("current")]));
  await newLoad;
  first.resolve(page([question("stale")]));
  await oldLoad;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["current"],
    );
  }
});

test("preserves opaque feed cursors when loading the next bounded page", async () => {
  const inputs: Array<{ subjectId?: string; cursor?: string; limit?: number }> =
    [];
  const api: CommunityApi = {
    questions: async (input) => {
      inputs.push(input);
      return inputs.length === 1
        ? page([question("first")], "opaque-next")
        : page([question("second")]);
    },
    question: async (id) => detail(id),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => ({ answer: answer("created") }),
  };
  const controller = new MobileCommunityFeedController(api);

  await controller.load("authority-a", { subjectId: "subject-a", limit: 25 });
  await controller.loadMore("authority-a");

  assert.deepEqual(inputs, [
    { subjectId: "subject-a", limit: 25 },
    { subjectId: "subject-a", limit: 25, cursor: "opaque-next" },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["first", "second"],
    );
    assert.equal(snapshot.page.nextCursor, null);
  }
});

test("invalidating the feed authority aborts and fences its pending request", async () => {
  const pending = deferred<QuestionSearchResponse>();
  let signal: AbortSignal | undefined;
  const controller = new MobileCommunityFeedController({
    questions: async (_input, requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
    question: async (id) => detail(id),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => ({ answer: answer("created") }),
  });

  const loading = controller.load("authority-a", { limit: 25 });
  controller.invalidate("authority-a");
  pending.resolve(page([question("late")]));
  await loading;

  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("surfaces distinct offline, timeout and restricted feed states", async (t) => {
  const cases = [
    ["offline", "offline", "NETWORK_UNAVAILABLE"],
    ["timeout", "timeout", "REQUEST_TIMEOUT"],
    ["restricted", "forbidden", "ACCOUNT_RESTRICTED"],
  ] as const;

  for (const [expected, kind, code] of cases) {
    await t.test(expected, async () => {
      const controller = new MobileCommunityFeedController({
        questions: async () => {
          throw new ApiRequestError(kind, null, code, "request failed");
        },
        question: async (id) => detail(id),
        answers: async () => ({ items: [], nextCursor: null }),
        createQuestion: async () => ({ question: question("created") }),
        createAnswer: async () => ({ answer: answer("created") }),
      });

      await controller.load("authority-a", { limit: 25 });

      const snapshot = controller.getSnapshot();
      assert.equal(snapshot.kind, "failure");
      if (snapshot.kind === "failure")
        assert.equal(snapshot.failure.kind, expected);
    });
  }
});

test("a late detail response cannot overwrite a detail opened under a new authority", async () => {
  const first = deferred<QuestionDetailResponse>();
  const second = deferred<QuestionDetailResponse>();
  let calls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async () => (++calls === 1 ? first.promise : second.promise),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => ({ answer: answer("created") }),
  });

  const oldLoad = controller.load("authority-a", "question-a");
  const newLoad = controller.load("authority-b", "question-b");
  second.resolve(detail("question-b"));
  await newLoad;
  first.resolve(detail("question-a"));
  await oldLoad;

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "authority-b");
    assert.equal(snapshot.detail.question.id, "question-b");
  }
});

test("creates an answer and refreshes the authoritative question projection", async () => {
  let answerCreated = false;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) =>
      detail(id, answerCreated ? [answer("answer-a")] : []),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => {
      answerCreated = true;
      return { answer: answer("answer-a") };
    },
  });

  await controller.load("authority-a", "question-a");
  const sent = await controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );

  assert.equal(sent, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.notice, "Respuesta publicada.");
    assert.deepEqual(
      snapshot.detail.answers.map((item) => item.id),
      ["answer-a"],
    );
  }
});

test("reports when an answer succeeded but the follow-up detail read failed", async () => {
  let detailCalls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => {
      detailCalls += 1;
      if (detailCalls > 1) {
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "offline",
        );
      }
      return detail(id);
    },
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => ({ answer: answer("created") }),
  });

  await controller.load("authority-a", "question-a");
  const sent = await controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );

  assert.equal(sent, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(
      snapshot.notice,
      "Respuesta publicada. No pudimos actualizar la conversación.",
    );
    assert.deepEqual(snapshot.refreshFailure, {
      kind: "offline",
      code: "NETWORK_UNAVAILABLE",
    });
  }
});

test("a context invalidation prevents an in-flight answer from committing UI state", async () => {
  const mutation = deferred<{ answer: AnswerView }>();
  let mutationSignal: AbortSignal | undefined;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => detail(id),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async (_questionId, _input, signal) => {
      mutationSignal = signal;
      return mutation.promise;
    },
  });

  await controller.load("authority-a", "question-a");
  const submitting = controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );
  controller.invalidate("authority-a");
  mutation.resolve({ answer: answer("late") });

  assert.equal(await submitting, false);
  assert.equal(mutationSignal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("keeps duplicate answer submission locked until the authoritative refresh finishes", async () => {
  const refresh = deferred<QuestionDetailResponse>();
  let questionCalls = 0;
  let createCalls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => {
      questionCalls += 1;
      return questionCalls === 1 ? detail(id) : refresh.promise;
    },
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => {
      createCalls += 1;
      return { answer: answer("answer-a") };
    },
  });

  await controller.load("authority-a", "question-a");
  const first = controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );
  await Promise.resolve();

  const pending = controller.getSnapshot();
  assert.equal(pending.kind, "ready");
  if (pending.kind === "ready") assert.equal(pending.submittingAnswer, true);

  const duplicate = await controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );
  assert.equal(duplicate, false);
  assert.equal(createCalls, 1);

  refresh.resolve(detail("question-a", [answer("answer-a")]));
  assert.equal(await first, true);

  const settled = controller.getSnapshot();
  assert.equal(settled.kind, "ready");
  if (settled.kind === "ready") {
    assert.equal(settled.submittingAnswer, false);
    assert.deepEqual(
      settled.detail.answers.map((item) => item.id),
      ["answer-a"],
    );
  }
});

test("does not let answer pagination cancel an in-flight answer mutation", async () => {
  const mutation = deferred<{ answer: AnswerView }>();
  let mutationSignal: AbortSignal | undefined;
  let answerPageCalls = 0;
  let detailCalls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => {
      detailCalls += 1;
      return detail(
        id,
        detailCalls > 1 ? [answer("answer-a")] : [],
        detailCalls > 1 ? null : "opaque-answer-cursor",
      );
    },
    answers: async () => {
      answerPageCalls += 1;
      return { items: [answer("older")], nextCursor: null };
    },
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async (_questionId, _input, signal) => {
      mutationSignal = signal;
      return mutation.promise;
    },
  });

  await controller.load("authority-a", "question-a");
  const submitting = controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );
  await Promise.resolve();

  await controller.loadMoreAnswers("authority-a");
  assert.equal(answerPageCalls, 0);
  assert.equal(mutationSignal?.aborted, false);

  mutation.resolve({ answer: answer("answer-a") });
  assert.equal(await submitting, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") assert.equal(snapshot.submittingAnswer, false);
});

test("composer authority cancellation aborts its POST and resets the local submit lock", () => {
  const operation = new AbortController();
  let submitting = true;

  const active = cancelCommunityComposerSubmission(operation, () => {
    submitting = false;
  });

  assert.equal(active, null);
  assert.equal(operation.signal.aborted, true);
  assert.equal(submitting, false);
});

test("reconciles an ambiguous timed-out answer before another submit can be enabled", async () => {
  const reconciliation = deferred<QuestionDetailResponse>();
  let detailCalls = 0;
  let createCalls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => {
      detailCalls += 1;
      return detailCalls === 1 ? detail(id) : reconciliation.promise;
    },
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => {
      createCalls += 1;
      throw new ApiRequestError(
        "timeout",
        null,
        "REQUEST_TIMEOUT",
        "request timed out",
      );
    },
  });

  await controller.load("authority-a", "question-a");
  const pending = controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );
  await Promise.resolve();

  const duringReconciliation = controller.getSnapshot();
  assert.equal(duringReconciliation.kind, "ready");
  if (duringReconciliation.kind === "ready") {
    assert.equal(duringReconciliation.submittingAnswer, true);
  }

  assert.equal(
    await controller.createAnswer(
      "authority-a",
      "question-a",
      "Una respuesta útil.",
    ),
    false,
  );
  assert.equal(createCalls, 1);

  reconciliation.resolve(
    detail("question-a", [
      {
        ...answer("answer-a"),
        body: "Una respuesta útil.",
        viewer: { canEdit: true, canReport: true },
      },
    ]),
  );
  assert.equal(await pending, true);

  const reconciled = controller.getSnapshot();
  assert.equal(reconciled.kind, "ready");
  if (reconciled.kind === "ready") {
    assert.equal(reconciled.submittingAnswer, false);
    assert.equal(reconciled.actionFailure, null);
    assert.equal(reconciled.notice, "Respuesta publicada.");
  }
});

test("blocks answer retry when an ambiguous mutation cannot be reconciled until a fresh load", async () => {
  let detailCalls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => {
      detailCalls += 1;
      if (detailCalls > 1) {
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "offline",
        );
      }
      return detail(id);
    },
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => {
      throw new ApiRequestError(
        "timeout",
        null,
        "REQUEST_TIMEOUT",
        "request timed out",
      );
    },
  });

  await controller.load("authority-a", "question-a");
  assert.equal(
    await controller.createAnswer(
      "authority-a",
      "question-a",
      "Una respuesta útil.",
    ),
    false,
  );

  const unresolved = controller.getSnapshot();
  assert.equal(unresolved.kind, "ready");
  if (unresolved.kind === "ready") {
    assert.equal(unresolved.answerRetryBlocked, true);
    assert.equal(unresolved.submittingAnswer, false);
  }

  assert.equal(
    await controller.createAnswer(
      "authority-a",
      "question-a",
      "Una respuesta útil.",
    ),
    false,
  );
});

test("question routes preserve cold deep links while session restore is pending", () => {
  assert.equal(communityQuestionRouteGate("restoring"), "restoring");
  assert.equal(communityQuestionRouteGate("authenticated"), "ready");
  for (const kind of [
    "unauthenticated",
    "restricted",
    "offline",
    "timeout",
    "server_unavailable",
    "error",
  ]) {
    assert.equal(communityQuestionRouteGate(kind), "redirect");
  }
});

test("reconciles an ambiguous answer committed beyond the first answer page", async () => {
  const oldAnswers = Array.from({ length: 25 }, (_, index) =>
    answer(`old-${index + 1}`),
  );
  let detailCalls = 0;
  let answerPageCalls = 0;
  const controller = new MobileCommunityQuestionController({
    questions: async () => page([]),
    question: async (id) => {
      detailCalls += 1;
      return detail(
        id,
        oldAnswers,
        detailCalls === 1 ? "baseline-next" : "reconcile-next",
      );
    },
    answers: async (_questionId, cursor) => {
      answerPageCalls += 1;
      if (cursor === "baseline-next") {
        return { items: [answer("old-26")], nextCursor: null };
      }
      assert.equal(cursor, "reconcile-next");
      return {
        items: [
          answer("old-26"),
          {
            ...answer("new-answer"),
            body: "Una respuesta útil.",
            viewer: { canEdit: true, canReport: true },
          },
        ],
        nextCursor: null,
      };
    },
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => {
      throw new ApiRequestError(
        "timeout",
        null,
        "REQUEST_TIMEOUT",
        "request timed out",
      );
    },
  });

  await controller.load("authority-a", "question-a");
  const sent = await controller.createAnswer(
    "authority-a",
    "question-a",
    "Una respuesta útil.",
  );

  assert.equal(sent, true);
  assert.equal(answerPageCalls, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.answerRetryBlocked, false);
    assert.equal(snapshot.notice, "Respuesta publicada.");
    assert.ok(
      snapshot.detail.answers.some(
        (candidate) => candidate.id === "new-answer",
      ),
    );
  }
});

test("question creation reconciliation only accepts a new owned exact match", async () => {
  const input = {
    subjectId: "subject-a",
    courseOfferingId: "offering-a",
    title: "¿Cómo se integra esto?",
    body: "Necesito entender el paso intermedio con más detalle.",
  };
  const oldOwned = {
    ...question("old-question"),
    title: input.title,
    body: input.body,
    academic: {
      subject: { id: "subject-a", name: "Álgebra" },
      courseOffering: { id: "offering-a", name: "Comisión A" },
    },
    viewer: {
      canEdit: true,
      canAnswer: true,
      canAcceptAnswers: true,
      canReport: true,
    },
  };
  const newOwned = { ...oldOwned, id: "new-question" };
  let phase: "baseline" | "reconcile" = "baseline";
  const api: CommunityApi = {
    questions: async (request) => {
      assert.equal(request.q, input.title);
      assert.equal(request.subjectId, input.subjectId);
      return page(phase === "baseline" ? [oldOwned] : [oldOwned, newOwned]);
    },
    question: async (id) => detail(id),
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => ({ question: question("created") }),
    createAnswer: async () => ({ answer: answer("created") }),
  };

  const baseline = await captureOwnedQuestionBaseline(api, input);
  phase = "reconcile";
  const reconciled = await reconcileQuestionCreation(api, input, baseline);

  assert.deepEqual([...baseline], ["old-question"]);
  assert.equal(reconciled?.id, "new-question");
});
