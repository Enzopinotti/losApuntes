import type {
  AcademicCurrentContext,
  AcademicSubjectParticipation,
} from "@losapuntes/contracts";
import type {
  AnswerPageResponse,
  AnswerView,
  QuestionDetailResponse,
  QuestionSearchResponse,
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
      actionFailure: CommunityFailure | null;
      actionFailureCode: string | null;
      notice: string | null;
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

  constructor(private readonly api: CommunityApi) {}

  getSnapshot(): CommunityQuestionDetailSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DetailListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string, questionId: string): Promise<void> {
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
      current.submittingAnswer
    ) {
      return false;
    }

    const generation = this.begin(authorityKey);
    this.publish({
      ...current,
      submittingAnswer: true,
      actionFailure: null,
      actionFailureCode: null,
      notice: null,
      refreshFailure: null,
    });
    const signal = this.activeOperation?.signal;

    try {
      await this.api.createAnswer(questionId, { body }, signal);
      if (!this.isCurrent(generation, authorityKey)) return false;
      const latest = this.snapshot;
      if (latest.kind !== "ready" || latest.questionId !== questionId) {
        return false;
      }

      this.publish({
        ...latest,
        submittingAnswer: false,
        actionFailure: null,
        actionFailureCode: null,
        notice: "Respuesta publicada.",
      });

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
            notice: "Respuesta publicada.",
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
            notice:
              "Respuesta publicada. No pudimos actualizar la conversación.",
            refreshFailure: communityFailure(error),
          });
        }
      }

      return true;
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return false;
      const latest = this.snapshot;
      if (latest.kind !== "ready" || latest.questionId !== questionId) {
        return false;
      }
      const failure = communityFailure(error);
      this.publish({
        ...latest,
        submittingAnswer: false,
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
  ): CommunityQuestionDetailSnapshot {
    return {
      kind: "ready",
      authorityKey,
      questionId,
      detail,
      loadingMoreAnswers: false,
      answersFailure: null,
      submittingAnswer: false,
      actionFailure: null,
      actionFailureCode: null,
      notice: null,
      refreshFailure: null,
    };
  }

  private publish(snapshot: CommunityQuestionDetailSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
