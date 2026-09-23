import type {
  AnswerView,
  ConnectionStatus,
  ConnectionView,
  FollowingItem,
  NotificationView,
  QuestionDetailResponse,
  QuestionSearchResponse,
  QuestionState,
  QuestionView,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class CommunityApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(
    code: string,
    status: number,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "CommunityApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function apiUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), `${apiBaseUrl}/`).toString();
}

function envelopeMessage(envelope: ErrorEnvelope): string {
  if (Array.isArray(envelope.message)) return envelope.message.join(" ");
  return envelope.message || "No pudimos completar la operación.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CommunityApiError(
      "NETWORK_UNAVAILABLE",
      0,
      "No pudimos conectarnos con Los Apuntes.",
    );
  }

  const text = await response.text();
  let parsed: unknown = null;

  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new CommunityApiError(
        "INVALID_RESPONSE",
        response.status,
        "El servidor devolvió una respuesta inválida.",
        response.headers.get("x-request-id") ?? undefined,
      );
    }
  }

  if (!response.ok) {
    const envelope =
      typeof parsed === "object" && parsed !== null
        ? (parsed as ErrorEnvelope)
        : {};

    throw new CommunityApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      envelopeMessage(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return parsed as T;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const communityApi = {
  following: (limit = 50, cursor?: string) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);

    return request<{ items: FollowingItem[]; nextCursor: string | null }>(
      `/social/me/following?${query.toString()}`,
    );
  },

  follow: (profileId: string) =>
    request<{ following: true }>(
      `/social/profiles/${encodeURIComponent(profileId)}/follow`,
      { method: "PUT" },
    ),

  unfollow: (profileId: string) =>
    request<void>(`/social/profiles/${encodeURIComponent(profileId)}/follow`, {
      method: "DELETE",
    }),

  connections: (status?: ConnectionStatus, limit = 50, cursor?: string) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (status) query.set("status", status);
    if (cursor) query.set("cursor", cursor);

    return request<{ items: ConnectionView[]; nextCursor: string | null }>(
      `/social/me/connections?${query.toString()}`,
    );
  },

  requestConnection: (profileId: string) =>
    request<{ connection: ConnectionView }>(
      `/social/profiles/${encodeURIComponent(profileId)}/connections`,
      { method: "POST" },
    ),

  respondConnection: (id: string, action: "accept" | "decline") =>
    request<{ connection: ConnectionView }>(
      `/social/connections/${encodeURIComponent(id)}/${action}`,
      { method: "POST" },
    ),

  disconnect: (id: string) =>
    request<void>(`/social/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  questions: (input: {
    q?: string;
    subjectId?: string;
    status?: QuestionState;
    cursor?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams({
      limit: String(input.limit ?? 25),
    });
    if (input.q) query.set("q", input.q);
    if (input.subjectId) query.set("subjectId", input.subjectId);
    if (input.status) query.set("status", input.status);
    if (input.cursor) query.set("cursor", input.cursor);
    return request<QuestionSearchResponse>(`/questions?${query.toString()}`);
  },

  question: (id: string) =>
    request<QuestionDetailResponse>(`/questions/${encodeURIComponent(id)}`),

  createQuestion: (input: { subjectId: string; title: string; body: string }) =>
    request<{ question: QuestionView }>("/questions", {
      method: "POST",
      body: json(input),
    }),

  updateQuestion: (
    question: QuestionView,
    patch: {
      title?: string;
      body?: string;
      status?: QuestionState;
    },
  ) =>
    request<{ question: QuestionView }>(
      `/questions/${encodeURIComponent(question.id)}`,
      {
        method: "PATCH",
        body: json({
          expectedRevision: question.revision,
          ...patch,
        }),
      },
    ),

  createAnswer: (questionId: string, body: string) =>
    request<{ answer: AnswerView }>(
      `/questions/${encodeURIComponent(questionId)}/answers`,
      {
        method: "POST",
        body: json({ body }),
      },
    ),

  updateAnswer: (answer: AnswerView, body: string) =>
    request<{ answer: AnswerView }>(
      `/answers/${encodeURIComponent(answer.id)}`,
      {
        method: "PATCH",
        body: json({
          expectedRevision: answer.revision,
          body,
        }),
      },
    ),

  acceptAnswer: (question: QuestionView, answerId: string) =>
    request<{ question: QuestionView }>(
      `/questions/${encodeURIComponent(
        question.id,
      )}/answers/${encodeURIComponent(answerId)}/accept`,
      {
        method: "POST",
        body: json({ expectedRevision: question.revision }),
      },
    ),

  reportQuestion: (id: string) =>
    request<{ report: { id: string; status: "pending" } }>(
      `/questions/${encodeURIComponent(id)}/reports`,
      {
        method: "POST",
        body: json({
          reason: "other",
          details: "Reporte enviado desde la interfaz web",
        }),
      },
    ),

  reportAnswer: (id: string) =>
    request<{ report: { id: string; status: "pending" } }>(
      `/answers/${encodeURIComponent(id)}/reports`,
      {
        method: "POST",
        body: json({
          reason: "other",
          details: "Reporte enviado desde la interfaz web",
        }),
      },
    ),

  notifications: (input: {
    unreadOnly: boolean;
    cursor?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams({
      unreadOnly: String(input.unreadOnly),
      limit: String(input.limit ?? 50),
    });
    if (input.cursor) query.set("cursor", input.cursor);
    return request<{ items: NotificationView[]; nextCursor: string | null }>(
      `/notifications?${query.toString()}`,
    );
  },

  markNotificationRead: (id: string) =>
    request<{ read: true }>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    }),

  markAllNotificationsRead: () =>
    request<{ updated: number }>("/notifications/read-all", {
      method: "POST",
    }),
};

export function isCommunityApiError(
  error: unknown,
): error is CommunityApiError {
  return error instanceof CommunityApiError;
}
