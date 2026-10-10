import type {
  AnswerPageResponse,
  AnswerView,
  CommunityPerson,
  ConnectionStatus,
  ConnectionView,
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

export type MobileNotificationType =
  | "social.followed"
  | "social.connection_requested"
  | "social.connection_accepted"
  | "qa.question_answered"
  | "qa.answer_accepted";

export type MobileNotificationView = {
  id: string;
  type: MobileNotificationType;
  actor: CommunityPerson | null;
  target: {
    type: "profile" | "connection" | "question" | "answer";
    id: string;
  };
  readAt: string | null;
  createdAt: string;
};

export type MobileNotificationPage = {
  items: MobileNotificationView[];
  nextCursor: string | null;
};

export type NotificationPageInput = {
  unreadOnly: boolean;
  cursor?: string;
  limit?: number;
};

export type ConnectionsPageInput = {
  status?: ConnectionStatus;
  cursor?: string;
  limit?: number;
};

export type ConnectionsPageResponse = {
  items: ConnectionView[];
  nextCursor: string | null;
};

export interface SocialConnectionsApi {
  connections(
    input: ConnectionsPageInput,
    signal?: AbortSignal,
  ): Promise<ConnectionsPageResponse>;
  respondConnection(
    id: string,
    action: "accept" | "decline",
    signal?: AbortSignal,
  ): Promise<{ connection: ConnectionView }>;
  disconnectConnection(id: string, signal?: AbortSignal): Promise<void>;
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
  notifications(
    credential: string,
    input: NotificationPageInput,
    signal?: AbortSignal,
  ): Promise<MobileNotificationPage>;
  markNotificationRead(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ read: true }>;
  markAllNotificationsRead(
    credential: string,
    signal?: AbortSignal,
  ): Promise<{ updated: number }>;
  connections(
    credential: string,
    input: ConnectionsPageInput,
    signal?: AbortSignal,
  ): Promise<ConnectionsPageResponse>;
  respondConnection(
    credential: string,
    id: string,
    action: "accept" | "decline",
    signal?: AbortSignal,
  ): Promise<{ connection: ConnectionView }>;
  disconnectConnection(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface CommunityNotificationsApi {
  notifications(
    input: NotificationPageInput,
    signal?: AbortSignal,
  ): Promise<MobileNotificationPage>;
  markNotificationRead(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ read: true }>;
  markAllNotificationsRead(signal?: AbortSignal): Promise<{ updated: number }>;
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

  notifications(
    credential: string,
    input: NotificationPageInput,
    signal?: AbortSignal,
  ) {
    const requestedLimit = Number.isFinite(input.limit)
      ? Math.trunc(input.limit!)
      : 30;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const query = new URLSearchParams({
      unreadOnly: String(input.unreadOnly),
      limit: String(limit),
    });
    if (input.cursor) query.set("cursor", input.cursor);

    return this.client.request<MobileNotificationPage>(
      `/notifications?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  markNotificationRead(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<{ read: true }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      {
        method: "PATCH",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  markAllNotificationsRead(credential: string, signal?: AbortSignal) {
    return this.client.request<{ updated: number }>("/notifications/read-all", {
      method: "POST",
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  connections(
    credential: string,
    input: ConnectionsPageInput,
    signal?: AbortSignal,
  ) {
    const requestedLimit = Number.isFinite(input.limit)
      ? Math.trunc(input.limit!)
      : 25;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const query = new URLSearchParams({ limit: String(limit) });
    if (input.status) query.set("status", input.status);
    if (input.cursor) query.set("cursor", input.cursor);

    return this.client.request<ConnectionsPageResponse>(
      `/social/me/connections?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  respondConnection(
    credential: string,
    id: string,
    action: "accept" | "decline",
    signal?: AbortSignal,
  ) {
    return this.client.request<{ connection: ConnectionView }>(
      `/social/connections/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  disconnectConnection(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<void>(
      `/social/connections/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileCommunityApi
  implements CommunityApi, CommunityNotificationsApi, SocialConnectionsApi
{
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

  notifications(input: NotificationPageInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.notifications(credential, input, signal),
    );
  }

  markNotificationRead(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.markNotificationRead(credential, id, signal),
    );
  }

  markAllNotificationsRead(signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.markAllNotificationsRead(credential, signal),
    );
  }

  connections(input: ConnectionsPageInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.connections(credential, input, signal),
    );
  }

  respondConnection(
    id: string,
    action: "accept" | "decline",
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.respondConnection(credential, id, action, signal),
    );
  }

  disconnectConnection(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.disconnectConnection(credential, id, signal),
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
