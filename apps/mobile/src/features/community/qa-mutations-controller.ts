import type {
  AnswerView,
  QuestionDetailResponse,
  QuestionState,
} from "@losapuntes/contracts/social-qa";

import type { CommunityQaMutationsApi } from "./community-api";
import {
  communityFailure,
  isAmbiguousCommunityMutationFailure,
  type CommunityFailure,
} from "./community-controller";

export type QaMutation =
  | { kind: "edit-question"; title: string; body: string }
  | { kind: "set-question-state"; state: QuestionState }
  | { kind: "edit-answer"; answerId: string; body: string }
  | { kind: "accept-answer"; answerId: string };

export type QaMutationSnapshot =
  | { kind: "idle" }
  | { kind: "busy"; authorityKey: string; questionId: string }
  | {
      kind: "failure" | "uncertain";
      authorityKey: string;
      questionId: string;
      failure: CommunityFailure;
    }
  | { kind: "success"; authorityKey: string; questionId: string };

export function canApplyQaMutation(
  detail: QuestionDetailResponse,
  action: QaMutation,
): boolean {
  const { question, answers } = detail;
  if (action.kind === "edit-question") {
    return (
      question.viewer.canEdit &&
      action.title.trim().length >= 5 &&
      action.title.trim().length <= 180 &&
      action.body.trim().length >= 10 &&
      action.body.trim().length <= 5000
    );
  }
  if (action.kind === "set-question-state") {
    return question.viewer.canEdit && question.state !== action.state;
  }
  const answer = answers.find((item) => item.id === action.answerId);
  if (!answer || answer.questionId !== question.id) return false;
  if (action.kind === "edit-answer") {
    return (
      answer.viewer.canEdit &&
      action.body.trim().length >= 2 &&
      action.body.trim().length <= 5000
    );
  }
  return (
    question.viewer.canAcceptAnswers &&
    question.acceptedAnswerId !== action.answerId
  );
}

function observedAfterAmbiguousMutation(
  before: QuestionDetailResponse,
  after: QuestionDetailResponse,
  action: QaMutation,
): boolean {
  if (before.question.id !== after.question.id) return false;
  if (action.kind === "edit-question") {
    return (
      after.question.revision > before.question.revision &&
      after.question.title === action.title.trim() &&
      after.question.body === action.body.trim()
    );
  }
  if (action.kind === "set-question-state") {
    return (
      after.question.revision > before.question.revision &&
      after.question.state === action.state
    );
  }
  if (action.kind === "accept-answer") {
    return (
      after.question.revision > before.question.revision &&
      after.question.acceptedAnswerId === action.answerId
    );
  }
  const original = before.answers.find((item) => item.id === action.answerId);
  const updated = after.answers.find((item) => item.id === action.answerId);
  return Boolean(
    original &&
      updated &&
      updated.revision > original.revision &&
      updated.body === action.body.trim(),
  );
}

export class MobileQaMutationsController {
  private snapshot: QaMutationSnapshot = { kind: "idle" };
  private readonly listeners = new Set<(state: QaMutationSnapshot) => void>();
  private generation = 0;
  private authorityKey: string | null = null;
  private active: AbortController | null = null;

  constructor(private readonly api: CommunityQaMutationsApi) {}

  getSnapshot(): QaMutationSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (state: QaMutationSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async apply(
    authorityKey: string,
    detail: QuestionDetailResponse,
    action: QaMutation,
  ): Promise<boolean> {
    if (
      this.snapshot.kind === "busy" ||
      this.snapshot.kind === "uncertain" ||
      this.snapshot.kind === "failure" ||
      !canApplyQaMutation(detail, action)
    ) {
      return false;
    }

    const questionId = detail.question.id;
    const generation = this.begin(authorityKey);
    const signal = this.active?.signal;
    this.publish({ kind: "busy", authorityKey, questionId });

    try {
      if (action.kind === "edit-question") {
        await this.api.updateQuestion(
          questionId,
          {
            expectedRevision: detail.question.revision,
            title: action.title.trim(),
            body: action.body.trim(),
          },
          signal,
        );
      } else if (action.kind === "set-question-state") {
        await this.api.updateQuestion(
          questionId,
          { expectedRevision: detail.question.revision, status: action.state },
          signal,
        );
      } else if (action.kind === "edit-answer") {
        const answer: AnswerView | undefined = detail.answers.find(
          (candidate) => candidate.id === action.answerId,
        );
        if (!answer) return false;
        await this.api.updateAnswer(
          answer.id,
          { expectedRevision: answer.revision, body: action.body.trim() },
          signal,
        );
      } else {
        await this.api.acceptAnswer(
          questionId,
          action.answerId,
          detail.question.revision,
          signal,
        );
      }
      if (!this.isCurrent(generation, authorityKey)) return false;
      this.publish({ kind: "success", authorityKey, questionId });
      return true;
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return false;
      const failure = communityFailure(error);
      if (isAmbiguousCommunityMutationFailure(failure)) {
        // PATCH/POST may already have committed. Never resend before re-reading.
        try {
          const current = await this.api.question(questionId, signal);
          if (!this.isCurrent(generation, authorityKey)) return false;
          if (observedAfterAmbiguousMutation(detail, current, action)) {
            this.publish({ kind: "success", authorityKey, questionId });
            return true;
          }
        } catch {
          if (!this.isCurrent(generation, authorityKey)) return false;
        }
        this.publish({ kind: "uncertain", authorityKey, questionId, failure });
        return false;
      }
      this.publish({ kind: "failure", authorityKey, questionId, failure });
      return false;
    }
  }

  invalidate(): void {
    this.generation += 1;
    this.active?.abort();
    this.active = null;
    this.authorityKey = null;
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string): number {
    this.generation += 1;
    this.active?.abort();
    this.active = new AbortController();
    this.authorityKey = authorityKey;
    return this.generation;
  }

  private isCurrent(generation: number, authorityKey: string): boolean {
    return generation === this.generation && authorityKey === this.authorityKey;
  }

  private publish(snapshot: QaMutationSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
