import type {
  AcademicFeedResponse,
  FeedFeedbackSignal,
  FeedMode,
  FeedOrder,
  FeedPreferencesResponse,
  FeedTargetType,
  ForYouFeedResponse,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class FeedsApiError extends Error {
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
    this.name = "FeedsApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function apiUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), `${apiBaseUrl}/`).toString();
}

function message(envelope: ErrorEnvelope): string {
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
    throw new FeedsApiError(
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
      throw new FeedsApiError(
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

    throw new FeedsApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      message(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return parsed as T;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const feedsApi = {
  academic: (input: { limit?: number; cursor?: string }) => {
    const query = new URLSearchParams({
      limit: String(input.limit ?? 20),
    });
    if (input.cursor) query.set("cursor", input.cursor);
    return request<AcademicFeedResponse>(`/feeds/academic?${query.toString()}`);
  },

  forYou: (input: {
    limit?: number;
    cursor?: string;
    mode: FeedMode;
    order: FeedOrder;
  }) => {
    const query = new URLSearchParams({
      limit: String(input.limit ?? 20),
      mode: input.mode,
      order: input.order,
    });
    if (input.cursor) query.set("cursor", input.cursor);
    return request<ForYouFeedResponse>(`/feeds/for-you?${query.toString()}`);
  },

  preferences: () => request<FeedPreferencesResponse>("/feeds/preferences"),

  updatePreferences: (
    current: FeedPreferencesResponse["preferences"],
    patch: Partial<
      Pick<
        FeedPreferencesResponse["preferences"],
        | "useAcademic"
        | "useSocial"
        | "useInterests"
        | "mutedSubjectIds"
        | "mutedProfileIds"
        | "prioritizedSubjectIds"
      >
    >,
  ) =>
    request<FeedPreferencesResponse>("/feeds/preferences", {
      method: "PATCH",
      body: json({
        expectedRevision: current.revision,
        ...patch,
      }),
    }),

  setFeedback: (type: FeedTargetType, id: string, signal: FeedFeedbackSignal) =>
    request<{
      feedback: {
        targetType: FeedTargetType;
        targetId: string;
        signal: FeedFeedbackSignal;
      };
      changed: boolean;
      revision: number;
    }>(
      `/feeds/feedback/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: json({ signal }),
      },
    ),

  clearFeedback: (type: FeedTargetType, id: string) =>
    request<{ changed: boolean; revision: number }>(
      `/feeds/feedback/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

export function isFeedsApiError(error: unknown): error is FeedsApiError {
  return error instanceof FeedsApiError;
}
