import type {
  AnswerPageResponse,
  AnswerView,
  CommunityPerson,
  ConnectionStatus,
  ConnectionView,
  CreateAnswerInput,
  CreateQaReportInput,
  CreateQaReportResponse,
  CreateQuestionInput,
  FollowingItem,
  QuestionDetailResponse,
  QuestionSearchResponse,
  QuestionState,
  QuestionView,
} from "@losapuntes/contracts/social-qa";

import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

export interface QuestionPageInput {
  q?: string;
  subjectId?: string;
  status?: QuestionState;
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

export type FollowingPageInput = {
  cursor?: string;
  limit?: number;
};

export type FollowingPageResponse = {
  items: FollowingItem[];
  nextCursor: string | null;
};

export type ProfileRelationshipResponse = {
  isSelf: boolean;
  isFollowing: boolean;
  followsYou: boolean;
  connection: {
    id: string;
    status: ConnectionStatus;
    requestedByMe: boolean;
    incoming: boolean;
    respondedAt: string | null;
  } | null;
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
  requestConnection(
    profileId: string,
    signal?: AbortSignal,
  ): Promise<{ connection: ConnectionView }>;
}

export interface SocialFollowingApi {
  following(
    input: FollowingPageInput,
    signal?: AbortSignal,
  ): Promise<FollowingPageResponse>;
  followProfile(
    profileId: string,
    signal?: AbortSignal,
  ): Promise<{ following: true }>;
  unfollowProfile(profileId: string, signal?: AbortSignal): Promise<void>;
}

export interface SocialProfileRelationshipApi {
  profileRelationship(
    profileId: string,
    signal?: AbortSignal,
  ): Promise<ProfileRelationshipResponse>;
}

export interface CommunityQaReportsApi {
  reportQuestion(
    id: string,
    input: CreateQaReportInput,
    signal?: AbortSignal,
  ): Promise<CreateQaReportResponse>;
  reportAnswer(
    id: string,
    input: CreateQaReportInput,
    signal?: AbortSignal,
  ): Promise<CreateQaReportResponse>;
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
  updateQuestion(
    credential: string,
    id: string,
    input: {
      expectedRevision: number;
      title?: string;
      body?: string;
      status?: QuestionState;
    },
    signal?: AbortSignal,
  ): Promise<{ question: QuestionView }>;
  updateAnswer(
    credential: string,
    id: string,
    input: { expectedRevision: number; body: string },
    signal?: AbortSignal,
  ): Promise<{ answer: AnswerView }>;
  acceptAnswer(
    credential: string,
    questionId: string,
    answerId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<{ question: QuestionView }>;
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
  requestConnection(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<{ connection: ConnectionView }>;
  profileRelationship(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<ProfileRelationshipResponse>;
  following(
    credential: string,
    input: FollowingPageInput,
    signal?: AbortSignal,
  ): Promise<FollowingPageResponse>;
  followProfile(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<{ following: true }>;
  unfollowProfile(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  reportQuestion(
    credential: string,
    id: string,
    input: CreateQaReportInput,
    signal?: AbortSignal,
  ): Promise<CreateQaReportResponse>;
  reportAnswer(
    credential: string,
    id: string,
    input: CreateQaReportInput,
    signal?: AbortSignal,
  ): Promise<CreateQaReportResponse>;
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

export interface CommunityQaMutationsApi {
  question(id: string, signal?: AbortSignal): Promise<QuestionDetailResponse>;
  updateQuestion(
    id: string,
    input: {
      expectedRevision: number;
      title?: string;
      body?: string;
      status?: QuestionState;
    },
    signal?: AbortSignal,
  ): Promise<{ question: QuestionView }>;
  updateAnswer(
    id: string,
    input: { expectedRevision: number; body: string },
    signal?: AbortSignal,
  ): Promise<{ answer: AnswerView }>;
  acceptAnswer(
    questionId: string,
    answerId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<{ question: QuestionView }>;
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
    if (input.status) query.set("status", input.status);
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

  updateQuestion(
    credential: string,
    id: string,
    input: {
      expectedRevision: number;
      title?: string;
      body?: string;
      status?: QuestionState;
    },
    signal?: AbortSignal,
  ) {
    return this.client.request<{ question: QuestionView }>(
      "/questions/" + encodeURIComponent(id),
      {
        method: "PATCH",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  updateAnswer(
    credential: string,
    id: string,
    input: { expectedRevision: number; body: string },
    signal?: AbortSignal,
  ) {
    return this.client.request<{ answer: AnswerView }>(
      "/answers/" + encodeURIComponent(id),
      {
        method: "PATCH",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  acceptAnswer(
    credential: string,
    questionId: string,
    answerId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ) {
    return this.client.request<{ question: QuestionView }>(
      "/questions/" +
        encodeURIComponent(questionId) +
        "/answers/" +
        encodeURIComponent(answerId) +
        "/accept",
      {
        method: "POST",
        credential,
        body: { expectedRevision },
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

  requestConnection(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ) {
    return this.client.request<{ connection: ConnectionView }>(
      `/social/profiles/${encodeURIComponent(profileId)}/connections`,
      {
        method: "POST",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  profileRelationship(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ) {
    return this.client.request<ProfileRelationshipResponse>(
      `/social/profiles/${encodeURIComponent(profileId)}/relationship`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  following(
    credential: string,
    input: FollowingPageInput,
    signal?: AbortSignal,
  ) {
    const requestedLimit = Number.isFinite(input.limit)
      ? Math.trunc(input.limit!)
      : 25;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const query = new URLSearchParams({ limit: String(limit) });
    if (input.cursor) query.set("cursor", input.cursor);

    return this.client.request<FollowingPageResponse>(
      `/social/me/following?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  followProfile(credential: string, profileId: string, signal?: AbortSignal) {
    return this.client.request<{ following: true }>(
      `/social/profiles/${encodeURIComponent(profileId)}/follow`,
      { method: "PUT", credential, ...(signal ? { signal } : {}) },
    );
  }

  unfollowProfile(credential: string, profileId: string, signal?: AbortSignal) {
    return this.client.request<void>(
      `/social/profiles/${encodeURIComponent(profileId)}/follow`,
      { method: "DELETE", credential, ...(signal ? { signal } : {}) },
    );
  }

  reportQuestion(
    credential: string,
    id: string,
    input: CreateQaReportInput,
    signal?: AbortSignal,
  ) {
    return this.client.request<CreateQaReportResponse>(
      `/questions/${encodeURIComponent(id)}/reports`,
      {
        method: "POST",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  reportAnswer(
    credential: string,
    id: string,
    input: CreateQaReportInput,
    signal?: AbortSignal,
  ) {
    return this.client.request<CreateQaReportResponse>(
      `/answers/${encodeURIComponent(id)}/reports`,
      {
        method: "POST",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileCommunityApi
  implements
    CommunityApi,
    CommunityNotificationsApi,
    SocialConnectionsApi,
    SocialFollowingApi,
    SocialProfileRelationshipApi,
    CommunityQaReportsApi,
    CommunityQaMutationsApi
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

  updateQuestion(
    id: string,
    input: {
      expectedRevision: number;
      title?: string;
      body?: string;
      status?: QuestionState;
    },
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.updateQuestion(credential, id, input, signal),
    );
  }

  updateAnswer(
    id: string,
    input: { expectedRevision: number; body: string },
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.updateAnswer(credential, id, input, signal),
    );
  }

  acceptAnswer(
    questionId: string,
    answerId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.acceptAnswer(
        credential,
        questionId,
        answerId,
        expectedRevision,
        signal,
      ),
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

  requestConnection(profileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.requestConnection(credential, profileId, signal),
    );
  }

  profileRelationship(profileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.profileRelationship(credential, profileId, signal),
    );
  }

  following(input: FollowingPageInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.following(credential, input, signal),
    );
  }

  followProfile(profileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.followProfile(credential, profileId, signal),
    );
  }

  unfollowProfile(profileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.unfollowProfile(credential, profileId, signal),
    );
  }

  reportQuestion(id: string, input: CreateQaReportInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.reportQuestion(credential, id, input, signal),
    );
  }

  reportAnswer(id: string, input: CreateQaReportInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.reportAnswer(credential, id, input, signal),
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
