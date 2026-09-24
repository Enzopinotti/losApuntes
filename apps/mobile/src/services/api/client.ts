import type {
  AcceptedResponse,
  ActionTokenInput,
  AuthApiErrorBody,
  AuthSessionListResponse,
  AuthenticatedSessionResponse,
  EmailActionRequestInput,
  GoogleAvailabilityResponse,
  GoogleMobileInput,
  GoogleMobileLinkInput,
  GoogleUnlinkInput,
  LoginMethodsResponse,
  MobileAuthenticatedSessionResponse,
  PasswordChangeInput,
  PasswordLoginInput,
  PasswordRecoveryCompleteInput,
  RegisterInput,
} from "@losapuntes/contracts";

const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiFailureKind =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "conflict"
  | "gone"
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "unexpected";

export class ApiRequestError extends Error {
  constructor(
    readonly kind: ApiFailureKind,
    readonly status: number | null,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  body?: unknown;
  credential?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const failureKind = (status: number): ApiFailureKind => {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 410) return "gone";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server_unavailable";
  return "unexpected";
};

const parseErrorBody = async (
  response: Response,
): Promise<AuthApiErrorBody> => {
  try {
    return (await response.json()) as AuthApiErrorBody;
  } catch {
    return {};
  }
};

const serverMessage = (body: AuthApiErrorBody): string => {
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }

  if (Array.isArray(body.message)) {
    const joined = body.message
      .filter((item) => typeof item === "string")
      .join(". ");
    if (joined) return joined;
  }

  return "La solicitud no pudo completarse.";
};

export class MobileApiClient {
  constructor(readonly origin: string) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin) {
      throw new ApiRequestError(
        "unexpected",
        null,
        "CROSS_ORIGIN_REQUEST_BLOCKED",
        "La solicitud apunta fuera del servidor configurado.",
      );
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      if (options.credential) {
        headers.Authorization = `Bearer ${options.credential}`;
      }

      const init: RequestInit = {
        method: options.method ?? "GET",
        headers,
        redirect: "error",
        signal: controller.signal,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      };

      const response = await fetch(url.toString(), init);

      if (!response.ok) {
        const body = await parseErrorBody(response);
        throw new ApiRequestError(
          failureKind(response.status),
          response.status,
          typeof body.code === "string" ? body.code : null,
          serverMessage(body),
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;

      if (controller.signal.aborted) {
        throw new ApiRequestError(
          timedOut ? "timeout" : "offline",
          null,
          timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED",
          timedOut
            ? "El servidor tardó demasiado en responder."
            : "La solicitud fue cancelada.",
        );
      }

      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "No se pudo conectar con Los Apuntes.",
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  register(input: RegisterInput, signal?: AbortSignal) {
    return this.request<AcceptedResponse>("/auth/register", {
      method: "POST",
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  requestEmailVerification(
    input: EmailActionRequestInput,
    signal?: AbortSignal,
  ) {
    return this.request<AcceptedResponse>("/auth/email-verification/request", {
      method: "POST",
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  inspectEmailVerification(input: ActionTokenInput, signal?: AbortSignal) {
    return this.request<{ verification: { available: true } }>(
      "/auth/email-verification/inspect",
      {
        method: "POST",
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  completeEmailVerification(input: ActionTokenInput, signal?: AbortSignal) {
    return this.request<void>("/auth/email-verification/complete", {
      method: "POST",
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  requestPasswordRecovery(
    input: EmailActionRequestInput,
    signal?: AbortSignal,
  ) {
    return this.request<AcceptedResponse>("/auth/password/recovery/request", {
      method: "POST",
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  inspectPasswordRecovery(input: ActionTokenInput, signal?: AbortSignal) {
    return this.request<{ recovery: { available: true } }>(
      "/auth/password/recovery/inspect",
      {
        method: "POST",
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  completePasswordRecovery(
    input: PasswordRecoveryCompleteInput,
    signal?: AbortSignal,
  ) {
    return this.request<void>("/auth/password/recovery/complete", {
      method: "POST",
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  mobileLogin(input: PasswordLoginInput, signal?: AbortSignal) {
    return this.request<MobileAuthenticatedSessionResponse>(
      "/auth/mobile/login",
      {
        method: "POST",
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  me(credential: string, signal?: AbortSignal) {
    return this.request<AuthenticatedSessionResponse>("/auth/me", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  logout(credential: string, signal?: AbortSignal) {
    return this.request<void>("/auth/session", {
      method: "DELETE",
      credential,
      ...(signal ? { signal } : {}),
    });
  }
  listSessions(credential: string, signal?: AbortSignal) {
    return this.request<AuthSessionListResponse>("/auth/sessions", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  revokeSession(
    credential: string,
    sessionId: string,
    signal?: AbortSignal,
  ) {
    return this.request<void>(
      `/auth/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  revokeAllSessions(credential: string, signal?: AbortSignal) {
    return this.request<void>("/auth/sessions", {
      method: "DELETE",
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  changePassword(
    credential: string,
    input: PasswordChangeInput,
    signal?: AbortSignal,
  ) {
    return this.request<void>("/auth/password/change", {
      method: "POST",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  googleStatus(signal?: AbortSignal) {
    return this.request<GoogleAvailabilityResponse>("/auth/google/status", {
      ...(signal ? { signal } : {}),
    });
  }

  googleMobileLogin(input: GoogleMobileInput, signal?: AbortSignal) {
    return this.request<MobileAuthenticatedSessionResponse>(
      "/auth/google/mobile",
      {
        method: "POST",
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  googleMobileLink(
    credential: string,
    input: GoogleMobileLinkInput,
    signal?: AbortSignal,
  ) {
    return this.request<void>("/auth/google/mobile/link", {
      method: "POST",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  loginMethods(credential: string, signal?: AbortSignal) {
    return this.request<LoginMethodsResponse>("/auth/login-methods", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  unlinkGoogle(
    credential: string,
    input: GoogleUnlinkInput,
    signal?: AbortSignal,
  ) {
    return this.request<void>("/auth/google", {
      method: "DELETE",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

}
