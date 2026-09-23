import type {
  OwnerProfileResponse,
  ProfileActivity,
  ProfileActivityType,
  PublicProfileResponse,
  UpdateProfileInput,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class ProfileApiError extends Error {
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
    this.name = "ProfileApiError";
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
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProfileApiError(
      "NETWORK_UNAVAILABLE",
      0,
      "No pudimos conectarnos con Los Apuntes.",
    );
  }

  const text = await response.text();
  let parsed: unknown;

  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new ProfileApiError(
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

    throw new ProfileApiError(
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

export const profileApi = {
  me: () => request<OwnerProfileResponse>("/profile/me"),

  create: (displayName: string) =>
    request<{ profile: NonNullable<OwnerProfileResponse["profile"]> }>(
      "/profile/me",
      {
        method: "POST",
        body: json({ displayName }),
      },
    ),

  update: (input: UpdateProfileInput) =>
    request<{ profile: NonNullable<OwnerProfileResponse["profile"]> }>(
      "/profile/me",
      {
        method: "PATCH",
        body: json(input),
      },
    ),

  publicProfile: (profileId: string) =>
    request<PublicProfileResponse>(
      `/profiles/${encodeURIComponent(profileId)}`,
    ),

  createActivity: (input: {
    type: ProfileActivityType;
    title: string;
    description?: string | null;
    url?: string | null;
    startedOn?: string | null;
    endedOn?: string | null;
  }) =>
    request<{ activity: ProfileActivity }>("/profile/me/activities", {
      method: "POST",
      body: json(input),
    }),

  deleteActivity: (activity: ProfileActivity) =>
    request<void>(
      `/profile/me/activities/${encodeURIComponent(
        activity.id,
      )}?expectedRevision=${activity.revision}`,
      { method: "DELETE" },
    ),
};

export function isProfileApiError(
  error: unknown,
): error is ProfileApiError {
  return error instanceof ProfileApiError;
}
