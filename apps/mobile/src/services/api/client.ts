import type {
  AuthApiErrorBody,
  AuthenticatedSessionResponse,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
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

const parseErrorBody = async (response: Response): Promise<AuthApiErrorBody> => {
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
    const joined = body.message.filter((item) => typeof item === "string").join(". ");
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

      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "error",
        signal: controller.signal,
      });

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

  mobileLogin(input: PasswordLoginInput, signal?: AbortSignal) {
    return this.request<MobileAuthenticatedSessionResponse>("/auth/mobile/login", {
      method: "POST",
      body: input,
      signal,
    });
  }

  me(credential: string, signal?: AbortSignal) {
    return this.request<AuthenticatedSessionResponse>("/auth/me", {
      credential,
      signal,
    });
  }

  logout(credential: string, signal?: AbortSignal) {
    return this.request<void>("/auth/session", {
      method: "DELETE",
      credential,
      signal,
    });
  }
}
