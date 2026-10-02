import type {
  AnswerPageResponse,
  AnswerView,
  CreateAnswerInput,
  CreateQuestionInput,
  QuestionDetailResponse,
  QuestionSearchResponse,
} from "@losapuntes/contracts/social-qa";

import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

export interface QuestionPageInput {
  q?: string;
  subjectId?: string;
  cursor?: string;
  limit?: number;
}

export interface CommunityTransport {
  questions(
    credential: string,
    input: QuestionPageInput,
    signal?: AbortSignal,
  ): Promise<QuestionSearchResponse>;
  question(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<QuestionDetailResponse>;
  answers(
    credential: string,
    questionId: string,
    cursor: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<AnswerPageResponse>;
  createQuestion(
    credential: string,
    input: CreateQuestionInput,
    signal?: AbortSignal,
  ): Promise<{ question: QuestionSearchResponse["items"][number] }>;
  createAnswer(
    credential: string,
    questionId: string,
    input: CreateAnswerInput,
    signal?: AbortSignal,
  ): Promise<{ answer: AnswerView }>;
}

export interface CommunityApi {
  questions(
    input: QuestionPageInput,
    signal?: AbortSignal,
  ): Promise<QuestionSearchResponse>;
  question(id: string, signal?: AbortSignal): Promise<QuestionDetailResponse>;
  answers(
    questionId: string,
    cursor: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<AnswerPageResponse>;
  createQuestion(
    input: CreateQuestionInput,
    signal?: AbortSignal,
  ): Promise<{ question: QuestionSearchResponse["items"][number] }>;
  createAnswer(
    questionId: string,
    input: CreateAnswerInput,
    signal?: AbortSignal,
  ): Promise<{ answer: AnswerView }>;
}

export class MobileCommunityHttpTransport implements CommunityTransport {
  constructor(private readonly client: MobileApiClient) {}

  questions(
    credential: string,
    input: QuestionPageInput,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: String(input.limit ?? 25) });
    if (input.q) query.set("q", input.q);
    if (input.subjectId) query.set("subjectId", input.subjectId);
    if (input.cursor) query.set("cursor", input.cursor);

    return this.client.request<QuestionSearchResponse>(
      `/questions?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  question(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<QuestionDetailResponse>(
      `/questions/${encodeURIComponent(id)}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  answers(
    credential: string,
    questionId: string,
    cursor: string,
    limit: number,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: String(limit), cursor });
    return this.client.request<AnswerPageResponse>(
      `/questions/${encodeURIComponent(questionId)}/answers?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  createQuestion(
    credential: string,
    input: CreateQuestionInput,
    signal?: AbortSignal,
  ) {
    return this.client.request<{
      question: QuestionSearchResponse["items"][number];
    }>("/questions", {
      method: "POST",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  createAnswer(
    credential: string,
    questionId: string,
    input: CreateAnswerInput,
    signal?: AbortSignal,
  ) {
    return this.client.request<{ answer: AnswerView }>(
      `/questions/${encodeURIComponent(questionId)}/answers`,
      {
        method: "POST",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileCommunityApi implements CommunityApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: CommunityTransport,
  ) {}

  questions(input: QuestionPageInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.questions(credential, input, signal),
    );
  }

  question(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.question(credential, id, signal),
    );
  }

  answers(
    questionId: string,
    cursor: string,
    limit: number,
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.answers(credential, questionId, cursor, limit, signal),
    );
  }

  createQuestion(input: CreateQuestionInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.createQuestion(credential, input, signal),
    );
  }

  createAnswer(
    questionId: string,
    input: CreateAnswerInput,
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.createAnswer(credential, questionId, input, signal),
    );
  }

  private async authorized<T>(
    operation: (credential: string) => Promise<T>,
  ): Promise<T> {
    const snapshot = this.session.getCredentialSnapshot();
    if (!snapshot) {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required",
      );
    }

    try {
      const value = await operation(snapshot.credential);
      if (
        !this.session.isCredentialAuthoritative(
          snapshot.credential,
          snapshot.generation,
        )
      ) {
        throw new ApiRequestError(
          "unauthorized",
          null,
          "STALE_SESSION_AUTHORITY",
          "Session authority changed while the request was in flight",
        );
      }
      return value;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.kind === "unauthorized") {
          await this.session.invalidateIfAuthoritative(
            snapshot.credential,
            snapshot.generation,
          );
        } else if (error.code === "ACCOUNT_RESTRICTED") {
          await this.session.restrictIfAuthoritative(
            snapshot.credential,
            snapshot.generation,
          );
        }
      }
      throw error;
    }
  }
}
