import type {
  AcademicCurrentContext,
  AcademicSubjectParticipation,
} from "@losapuntes/contracts";
import type {
  AnswerPageResponse,
  AnswerView,
  CreateQuestionInput,
  QuestionDetailResponse,
  QuestionSearchResponse,
  QuestionView,
} from "@losapuntes/contracts/social-qa";

import { ApiRequestError } from "@/services/api/client";

import type { CommunityApi, QuestionPageInput } from "./community-api";

export type CommunityFailureKind =
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "restricted"
  | "auth_required"
  | "error";

export type CommunityFailure = {
  kind: CommunityFailureKind;
  code: string | null;
};

export type CommunityQuestionFeedSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      page: QuestionSearchResponse;
      loadingMore: boolean;
      loadMoreFailure: CommunityFailure | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      failure: CommunityFailure;
    };

export type CommunityQuestionDetailSnapshot =
  | { kind: "idle" }
  | {
      kind: "loading";
      authorityKey: string;
      questionId: string;
    }
  | {
      kind: "ready";
      authorityKey: string;
      questionId: string;
      detail: QuestionDetailResponse;
      loadingMoreAnswers: boolean;
      answersFailure: CommunityFailure | null;
      submittingAnswer: boolean;
      answerRetryBlocked: boolean;
      actionFailure: CommunityFailure | null;
      actionFailureCode: string | null;
      notice: string | null;
      publishedAnswerBodyNormalized: string | null;
      refreshFailure: CommunityFailure | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      questionId: string;
      failure: CommunityFailure;
    };

type FeedListener = (snapshot: CommunityQuestionFeedSnapshot) => void;
type DetailListener = (snapshot: CommunityQuestionDetailSnapshot) => void;

type PendingAnswerReconciliation = {
  authorityKey: string;
  questionId: string;
  normalizedBody: string;
  knownAnswerIds: ReadonlySet<string>;
  failure: CommunityFailure | null;
};

export type QuestionScope =
  | { kind: "all" }
  | {
      kind: "subject";
      participation: AcademicSubjectParticipation;
      subjectId: string;
    }
  | { kind: "unresolved" };

export function resolveQuestionScope(
  context: AcademicCurrentContext | null,
  participations: AcademicSubjectParticipation[],
): QuestionScope {
  if (!context?.subjectParticipationId) return { kind: "all" };

  const participation = participations.find(
    (candidate) => candidate.id === context.subjectParticipationId,
  );
  if (!participation) return { kind: "unresolved" };

  return {
    kind: "subject",
    participation,
    subjectId: participation.subjectId,
  };
}

export function cancelCommunityComposerSubmission(
  operation: AbortController | null,
  resetSubmitting: () => void,
): null {
  operation?.abort();
  resetSubmitting();
  return null;
}

export function releaseCommunityComposerOperation(
  activeOperation: AbortController | null,
  completedOperation: AbortController,
  resetSubmitting: () => void,
): AbortController | null {
  if (activeOperation !== completedOperation) return activeOperation;
  resetSubmitting();
  return null;
}

export type CommunityQuestionRouteGate = "restoring" | "ready" | "redirect";

export function communityQuestionRouteGate(
  sessionKind: string,
): CommunityQuestionRouteGate {
  if (sessionKind === "restoring") return "restoring";
  if (
    sessionKind === "authenticated" ||
    sessionKind === "offline" ||
    sessionKind === "timeout" ||
    sessionKind === "server_unavailable" ||
    sessionKind === "error"
  ) {
    return "ready";
  }
  return "redirect";
}

export function normalizeCommunityMutationText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function questionReconciliationQuery(title: string): string {
  const normalizedTitle =
    normalizeCommunityMutationText(title).normalize("NFKC");
  return Array.from(normalizedTitle).slice(0, 120).join("");
}

export function shouldResetCommunityAnswerDraft(
  previous: { questionId: string; authorityKey: string | null },
  next: { questionId: string; authorityKey: string | null },
): boolean {
  if (previous.questionId !== next.questionId) return true;
  if (!previous.authorityKey || !next.authorityKey) return false;
  return previous.authorityKey !== next.authorityKey;
}

export function shouldClearCommunityAnswerDraft(
  snapshot: CommunityQuestionDetailSnapshot,
  currentBody: string,
): boolean {
  return (
    snapshot.kind === "ready" &&
    snapshot.publishedAnswerBodyNormalized !== null &&
    normalizeCommunityMutationText(currentBody) ===
      snapshot.publishedAnswerBodyNormalized
  );
}

export function communityAnswerDraftConfirmationTransition(
  previousVisible: boolean,
  snapshot: CommunityQuestionDetailSnapshot,
  currentBody: string,
): { visible: boolean; clearDraft: boolean } {
  const visible =
    snapshot.kind === "ready" &&
    snapshot.publishedAnswerBodyNormalized !== null;
  return {
    visible,
    clearDraft:
      visible &&
      !previousVisible &&
      shouldClearCommunityAnswerDraft(snapshot, currentBody),
  };
}

export function isAmbiguousCommunityMutationFailure(
  failure: CommunityFailure,
): boolean {
  return (
    failure.kind === "offline" ||
    failure.kind === "timeout" ||
    failure.kind === "server_unavailable"
  );
}

export function communityFailure(error: unknown): CommunityFailure {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "error", code: null };
  }
  if (error.code === "ACCOUNT_RESTRICTED") {
    return { kind: "restricted", code: error.code };
  }
  if (error.kind === "offline") return { kind: "offline", code: error.code };
  if (error.kind === "timeout") return { kind: "timeout", code: error.code };
  if (error.kind === "server_unavailable") {
    return { kind: "server_unavailable", code: error.code };
  }
  if (error.kind === "unauthorized") {
    return { kind: "auth_required", code: error.code };
  }
  if (error.kind === "forbidden") {
    return { kind: "restricted", code: error.code };
  }
  return { kind: "error", code: error.code };
}

function appendUniqueAnswers(
  current: AnswerView[],
  next: AnswerPageResponse["items"],
): AnswerView[] {
  const byId = new Map(current.map((answer) => [answer.id, answer]));
  for (const answer of next) byId.set(answer.id, answer);
  return [...byId.values()];
}

async function completeAnswerInventory(
  api: CommunityApi,
  questionId: string,
  detail: QuestionDetailResponse,
  signal?: AbortSignal,
): Promise<QuestionDetailResponse> {
  let answers = [...detail.answers];
  let cursor = detail.answersNextCursor;
  const seenCursors = new Set<string>();

  while (cursor) {
    if (seenCursors.has(cursor)) {
      throw new Error(
        "Answer pagination cursor repeated during reconciliation",
      );
    }
    seenCursors.add(cursor);
    const page = await api.answers(
      questionId,
      cursor,
      detail.answersLimit,
      signal,
    );
    answers = appendUniqueAnswers(answers, page.items);
    cursor = page.nextCursor;
  }

  return {
    ...detail,
    answers,
    answersNextCursor: null,
  };
}

function pendingAnswerWasCommitted(
  detail: QuestionDetailResponse,
  pending: PendingAnswerReconciliation,
): boolean {
  return detail.answers.some(
    (candidate) =>
      !pending.knownAnswerIds.has(candidate.id) &&
      candidate.viewer.canEdit &&
      normalizeCommunityMutationText(candidate.body) === pending.normalizedBody,
  );
}

function matchesOwnedQuestion(
  question: QuestionView,
  input: CreateQuestionInput,
): boolean {
  return (
    question.viewer.canEdit &&
    normalizeCommunityMutationText(question.title) ===
      normalizeCommunityMutationText(input.title) &&
    normalizeCommunityMutationText(question.body) ===
      normalizeCommunityMutationText(input.body) &&
    question.academic.subject.id === input.subjectId &&
    (question.academic.courseOffering?.id ?? null) ===
      (input.courseOfferingId ?? null)
  );
}

async function ownedQuestionMatches(
  api: CommunityApi,
  input: CreateQuestionInput,
  signal?: AbortSignal,
): Promise<QuestionView[]> {
  const matches: QuestionView[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await api.questions(
      {
        q: questionReconciliationQuery(input.title),
        subjectId: input.subjectId,
        limit: 25,
        ...(cursor ? { cursor } : {}),
      },
      signal,
    );
    matches.push(
      ...page.items.filter((question) => matchesOwnedQuestion(question, input)),
    );

    if (!page.nextCursor) return matches;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(
        "Question pagination cursor repeated during reconciliation",
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function captureOwnedQuestionBaseline(
  api: CommunityApi,
  input: CreateQuestionInput,
  signal?: AbortSignal,
): Promise<Set<string>> {
  return new Set(
    (await ownedQuestionMatches(api, input, signal)).map(
      (question) => question.id,
    ),
  );
}

export async function reconcileQuestionCreation(
  api: CommunityApi,
  input: CreateQuestionInput,
  baselineIds: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<QuestionView | null> {
  const matches = await ownedQuestionMatches(api, input, signal);
  return matches.find((question) => !baselineIds.has(question.id)) ?? null;
}

export class MobileCommunityFeedController {
  private snapshot: CommunityQuestionFeedSnapshot = { kind: "idle" };
  private readonly listeners = new Set<FeedListener>();
  private operationGeneration = 0;
  private activeOperation: AbortController | null = null;
  private authorityKey: string | null = null;
  private input: QuestionPageInput = { limit: 25 };

  constructor(private readonly api: CommunityApi) {}

  getSnapshot(): CommunityQuestionFeedSnapshot {
    return this.snapshot;
  }

  subscribe(listener: FeedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string, input: QuestionPageInput): Promise<void> {
    this.input = input;
    const generation = this.begin(authorityKey);
    this.publish({ kind: "loading", authorityKey });

    try {
      const page = await this.api.questions(
        input,
        this.activeOperation?.signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        page,
        loadingMore: false,
        loadMoreFailure: null,
      });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        failure: communityFailure(error),
      });
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.snapshot;
    if (
      current.kind !== "ready" ||
      current.authorityKey !== authorityKey ||
      current.loadingMore ||
      !current.page.nextCursor
    ) {
      return;
    }

    const generation = this.begin(authorityKey);
    this.publish({ ...current, loadingMore: true, loadMoreFailure: null });
    try {
      const nextPage = await this.api.questions(
        { ...this.input, cursor: current.page.nextCursor },
        this.activeOperation?.signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      const latest = this.snapshot;
      if (latest.kind !== "ready" || latest.authorityKey !== authorityKey) {
        return;
      }
      const byId = new Map(latest.page.items.map((item) => [item.id, item]));
      for (const item of nextPage.items) byId.set(item.id, item);
      this.publish({
        ...latest,
        page: { items: [...byId.values()], nextCursor: nextPage.nextCursor },
        loadingMore: false,
        loadMoreFailure: null,
      });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      const latest = this.snapshot;
      if (latest.kind !== "ready" || latest.authorityKey !== authorityKey) {
        return;
      }
      this.publish({
        ...latest,
        loadingMore: false,
        loadMoreFailure: communityFailure(error),
      });
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
    this.authorityKey = null;
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string): number {
    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = new AbortController();
    this.authorityKey = authorityKey;
    return this.operationGeneration;
  }

  private isCurrent(generation: number, authorityKey: string): boolean {
    return (
      generation === this.operationGeneration &&
      authorityKey === this.authorityKey
    );
  }

  private publish(snapshot: CommunityQuestionFeedSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

export class MobileCommunityQuestionController {
  private snapshot: CommunityQuestionDetailSnapshot = { kind: "idle" };
  private readonly listeners = new Set<DetailListener>();
  private operationGeneration = 0;
  private activeOperation: AbortController | null = null;
  private authorityKey: string | null = null;
  private pendingAnswer: PendingAnswerReconciliation | null = null;

  constructor(private readonly api: CommunityApi) {}

  getSnapshot(): CommunityQuestionDetailSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DetailListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string, questionId: string): Promise<void> {
    const current = this.snapshot;
    if (
      current.kind === "ready" &&
      current.authorityKey === authorityKey &&
      current.questionId === questionId &&
      current.submittingAnswer
    ) {
      return;
    }

    if (
      this.pendingAnswer &&
      (this.pendingAnswer.authorityKey !== authorityKey ||
        this.pendingAnswer.questionId !== questionId)
    ) {
      this.pendingAnswer = null;
    }

    const pending = this.pendingAnswer;
    if (pending) {
      const generation = this.begin(authorityKey);
      this.publish({ kind: "loading", authorityKey, questionId });
      try {
        const firstPage = await this.api.question(
          questionId,
          this.activeOperation?.signal,
        );
        const detail = await completeAnswerInventory(
          this.api,
          questionId,
          firstPage,
          this.activeOperation?.signal,
        );
        if (!this.isCurrent(generation, authorityKey)) return;
        if (this.pendingAnswer !== pending) return;

        const committed = pendingAnswerWasCommitted(detail, pending);
        const pendingFailureCode = pending.failure?.code ?? null;
        this.pendingAnswer = null;
        this.publish({
          ...this.ready(authorityKey, questionId, detail),
          actionFailure: committed ? null : pending.failure,
          actionFailureCode: committed ? null : pendingFailureCode,
          notice: committed
            ? "Respuesta publicada."
            : "No encontramos una respuesta publicada. Podés volver a intentar.",
          publishedAnswerBodyNormalized: committed
            ? pending.normalizedBody
            : null,
        });
      } catch (error) {
        if (!this.isCurrent(generation, authorityKey)) return;
        this.publish({
          kind: "failure",
          authorityKey,
          questionId,
          failure: communityFailure(error),
        });
      }
      return;
    }

    const generation = this.begin(authorityKey);
    this.publish({ kind: "loading", authorityKey, questionId });
    try {
      const detail = await this.api.question(
        questionId,
        this.activeOperation?.signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish(this.ready(authorityKey, questionId, detail));
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        questionId,
        failure: communityFailure(error),
      });
    }
  }

  async loadMoreAnswers(authorityKey: string): Promise<void> {
    const current = this.snapshot;
    if (
      current.kind !== "ready" ||
      current.authorityKey !== authorityKey ||
      current.loadingMoreAnswers ||
      current.submittingAnswer ||
      !current.detail.answersNextCursor
    ) {
      return;
    }

    const cursor = current.detail.answersNextCursor;
    const questionId = current.questionId;
    const generation = this.begin(authorityKey);
    this.publish({
      ...current,
      loadingMoreAnswers: true,
      answersFailure: null,
    });
    try {
      const page = await this.api.answers(
        questionId,
        cursor,
        current.detail.answersLimit,
        this.activeOperation?.signal,
      );
      if (!this.isCurrent(generation, authorityKey)) return;
      const latest = this.snapshot;
      if (
        latest.kind !== "ready" ||
        latest.authorityKey !== authorityKey ||
        latest.questionId !== questionId
      ) {
        return;
      }
      this.publish({
        ...latest,
        detail: {
          ...latest.detail,
          answers: appendUniqueAnswers(latest.detail.answers, page.items),
          answersNextCursor: page.nextCursor,
        },
        loadingMoreAnswers: false,
        answersFailure: null,
      });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      const latest = this.snapshot;
      if (latest.kind !== "ready" || latest.questionId !== questionId) return;
      this.publish({
        ...latest,
        loadingMoreAnswers: false,
        answersFailure: communityFailure(error),
      });
    }
  }

  async createAnswer(
    authorityKey: string,
    questionId: string,
    body: string,
  ): Promise<boolean> {
    const current = this.snapshot;
    if (
      current.kind !== "ready" ||
      current.authorityKey !== authorityKey ||
      current.questionId !== questionId ||
      current.submittingAnswer ||
      current.loadingMoreAnswers ||
      current.answerRetryBlocked
    ) {
      return false;
    }

    const normalizedBody = normalizeCommunityMutationText(body);
    const generation = this.begin(authorityKey);
    this.publish({
      ...current,
      submittingAnswer: true,
      answerRetryBlocked: false,
      actionFailure: null,
      actionFailureCode: null,
      notice: null,
      publishedAnswerBodyNormalized: null,
      refreshFailure: null,
    });
    const signal = this.activeOperation?.signal;

    let baselineDetail: QuestionDetailResponse;
    try {
      baselineDetail = await completeAnswerInventory(
        this.api,
        questionId,
        current.detail,
        signal,
      );
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return false;
      const latest = this.snapshot;
      if (
        latest.kind === "ready" &&
        latest.authorityKey === authorityKey &&
        latest.questionId === questionId
      ) {
        const failure = communityFailure(error);
        this.publish({
          ...latest,
          submittingAnswer: false,
          answerRetryBlocked: false,
          actionFailure: failure,
          actionFailureCode: failure.code,
          notice: null,
        });
      }
      return false;
    }

    const knownAnswerIds = new Set(
      baselineDetail.answers.map((candidate) => candidate.id),
    );
    const pending: PendingAnswerReconciliation = {
      authorityKey,
      questionId,
      normalizedBody,
      knownAnswerIds,
      failure: null,
    };
    this.pendingAnswer = pending;

    try {
      await this.api.createAnswer(questionId, { body }, signal);
      if (!this.isCurrent(generation, authorityKey)) return false;
      this.pendingAnswer = null;
      const latest = this.snapshot;
      if (latest.kind !== "ready" || latest.questionId !== questionId) {
        return false;
      }

      try {
        const detail = await this.api.question(questionId, signal);
        if (!this.isCurrent(generation, authorityKey)) return true;
        const refreshed = this.snapshot;
        if (
          refreshed.kind === "ready" &&
          refreshed.authorityKey === authorityKey &&
          refreshed.questionId === questionId
        ) {
          this.publish({
            ...refreshed,
            detail,
            submittingAnswer: false,
            answerRetryBlocked: false,
            actionFailure: null,
            actionFailureCode: null,
            notice: "Respuesta publicada.",
            publishedAnswerBodyNormalized: normalizedBody,
            refreshFailure: null,
          });
        }
      } catch (error) {
        if (!this.isCurrent(generation, authorityKey)) return true;
        const latestAfterRefresh = this.snapshot;
        if (
          latestAfterRefresh.kind === "ready" &&
          latestAfterRefresh.authorityKey === authorityKey &&
          latestAfterRefresh.questionId === questionId
        ) {
          this.publish({
            ...latestAfterRefresh,
            submittingAnswer: false,
            answerRetryBlocked: false,
            actionFailure: null,
            actionFailureCode: null,
            notice:
              "Respuesta publicada. No pudimos actualizar la conversación.",
            publishedAnswerBodyNormalized: normalizedBody,
            refreshFailure: communityFailure(error),
          });
        }
      }

      return true;
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return false;
      const latest = this.snapshot;
      if (
        latest.kind !== "ready" ||
        latest.authorityKey !== authorityKey ||
        latest.questionId !== questionId
      ) {
        return false;
      }

      const failure = communityFailure(error);
      if (isAmbiguousCommunityMutationFailure(failure)) {
        const ambiguousPending = { ...pending, failure };
        this.pendingAnswer = ambiguousPending;
        try {
          const firstPage = await this.api.question(questionId, signal);
          const detail = await completeAnswerInventory(
            this.api,
            questionId,
            firstPage,
            signal,
          );
          if (!this.isCurrent(generation, authorityKey)) return false;
          const reconciled = this.snapshot;
          if (
            reconciled.kind !== "ready" ||
            reconciled.authorityKey !== authorityKey ||
            reconciled.questionId !== questionId
          ) {
            return false;
          }

          const observedCommittedAnswer = pendingAnswerWasCommitted(
            detail,
            ambiguousPending,
          );
          this.pendingAnswer = null;
          this.publish({
            ...reconciled,
            detail,
            submittingAnswer: false,
            answerRetryBlocked: false,
            actionFailure: observedCommittedAnswer ? null : failure,
            actionFailureCode: observedCommittedAnswer ? null : failure.code,
            notice: observedCommittedAnswer
              ? "Respuesta publicada."
              : "No pudimos confirmar la publicación. Revisamos la conversación antes de habilitar otro intento.",
            publishedAnswerBodyNormalized: observedCommittedAnswer
              ? normalizedBody
              : null,
            refreshFailure: null,
          });
          return observedCommittedAnswer;
        } catch (reconcileError) {
          if (!this.isCurrent(generation, authorityKey)) return false;
          const unresolved = this.snapshot;
          if (
            unresolved.kind !== "ready" ||
            unresolved.authorityKey !== authorityKey ||
            unresolved.questionId !== questionId
          ) {
            return false;
          }
          this.publish({
            ...unresolved,
            submittingAnswer: false,
            answerRetryBlocked: true,
            actionFailure: failure,
            actionFailureCode: failure.code,
            notice:
              "No pudimos confirmar si la respuesta se publicó. Actualizá la conversación antes de volver a intentar.",
            refreshFailure: communityFailure(reconcileError),
          });
          return false;
        }
      }

      this.pendingAnswer = null;
      this.publish({
        ...latest,
        submittingAnswer: false,
        answerRetryBlocked: false,
        actionFailure: failure,
        actionFailureCode: failure.code,
        notice: null,
      });
      return false;
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
    this.authorityKey = null;
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string): number {
    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = new AbortController();
    this.authorityKey = authorityKey;
    return this.operationGeneration;
  }

  private isCurrent(generation: number, authorityKey: string): boolean {
    return (
      generation === this.operationGeneration &&
      authorityKey === this.authorityKey
    );
  }

  private ready(
    authorityKey: string,
    questionId: string,
    detail: QuestionDetailResponse,
  ): Extract<CommunityQuestionDetailSnapshot, { kind: "ready" }> {
    return {
      kind: "ready",
      authorityKey,
      questionId,
      detail,
      loadingMoreAnswers: false,
      answersFailure: null,
      submittingAnswer: false,
      answerRetryBlocked: false,
      actionFailure: null,
      actionFailureCode: null,
      notice: null,
      publishedAnswerBodyNormalized: null,
      refreshFailure: null,
    };
  }

  private publish(snapshot: CommunityQuestionDetailSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
