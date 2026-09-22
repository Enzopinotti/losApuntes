import type {
  ActiveSessionsResponse,
  AuthSnapshot,
  GoogleAuthStatus,
  LoginMethods,
} from "../interfaces";

type ErrorEnvelope = {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  requestId?: string;
};

type AcceptedResponse = {
  accepted: true;
};

type InspectionResponse = {
  verification?: {
    available: true;
  };
  recovery?: {
    available: true;
  };
};

type GoogleLinkStartResponse = {
  authorizationUrl?: string;
  alreadyLinked?: boolean;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class AuthApiError extends Error {
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
    this.name = "AuthApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function apiUrl(path: string): string {
  const base = `${apiBaseUrl}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}

function errorMessage(envelope: ErrorEnvelope): string {
  if (Array.isArray(envelope.message)) {
    return envelope.message.join(" ");
  }

  return envelope.message || "No pudimos completar la operación.";
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AuthApiError(
      "INVALID_RESPONSE",
      response.status,
      "El servidor devolvió una respuesta inválida.",
      response.headers.get("x-request-id") ?? undefined,
    );
  }
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
    throw new AuthApiError(
      "NETWORK_UNAVAILABLE",
      0,
      "No pudimos conectarnos con Los Apuntes.",
    );
  }

  const body = await parseJson(response);

  if (!response.ok) {
    const envelope =
      typeof body === "object" && body !== null ? (body as ErrorEnvelope) : {};

    throw new AuthApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      errorMessage(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return body as T;
}

function body(value: unknown): string {
  return JSON.stringify(value);
}

export const authApi = {
  me: () => request<AuthSnapshot>("/auth/me"),

  login: (email: string, password: string) =>
    request<AuthSnapshot>("/auth/login", {
      method: "POST",
      body: body({ email, password }),
    }),

  register: (email: string, password: string) =>
    request<AcceptedResponse>("/auth/register", {
      method: "POST",
      body: body({ email, password }),
    }),

  logout: () =>
    request<void>("/auth/session", {
      method: "DELETE",
    }),

  requestEmailVerification: (email: string) =>
    request<AcceptedResponse>("/auth/email-verification/request", {
      method: "POST",
      body: body({ email }),
    }),

  inspectEmailVerification: (token: string) =>
    request<InspectionResponse>("/auth/email-verification/inspect", {
      method: "POST",
      body: body({ token }),
    }),

  completeEmailVerification: (token: string) =>
    request<void>("/auth/email-verification/complete", {
      method: "POST",
      body: body({ token }),
    }),

  requestPasswordRecovery: (email: string) =>
    request<AcceptedResponse>("/auth/password/recovery/request", {
      method: "POST",
      body: body({ email }),
    }),

  inspectPasswordRecovery: (token: string) =>
    request<InspectionResponse>("/auth/password/recovery/inspect", {
      method: "POST",
      body: body({ token }),
    }),

  completePasswordRecovery: (token: string, newPassword: string) =>
    request<void>("/auth/password/recovery/complete", {
      method: "POST",
      body: body({ token, newPassword }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/password/change", {
      method: "POST",
      body: body({ currentPassword, newPassword }),
    }),

  sessions: () => request<ActiveSessionsResponse>("/auth/sessions"),

  revokeSession: (sessionId: string) =>
    request<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),

  revokeAllSessions: () =>
    request<void>("/auth/sessions", {
      method: "DELETE",
    }),

  googleStatus: () => request<GoogleAuthStatus>("/auth/google/status"),

  googleWebStartUrl: (returnTo = "/login") => {
    const url = new URL(apiUrl("/auth/google/web/start"));
    url.searchParams.set("returnTo", returnTo);
    return url.toString();
  },

  loginMethods: () => request<LoginMethods>("/auth/login-methods"),

  startGoogleLink: (currentPassword: string, returnTo = "/settings/security") =>
    request<GoogleLinkStartResponse>("/auth/google/web/link/start", {
      method: "POST",
      body: body({ currentPassword, returnTo }),
    }),

  unlinkGoogle: (currentPassword: string) =>
    request<void>("/auth/google", {
      method: "DELETE",
      body: body({ currentPassword }),
    }),
};

export function isAuthApiError(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError;
}
