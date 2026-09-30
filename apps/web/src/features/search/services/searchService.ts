import type {
  ContextualDiscoveryResponse,
  SearchResponse,
  SearchScope,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class SearchApiError extends Error {
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
    this.name = "SearchApiError";
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
  return envelope.message || "No pudimos completar la búsqueda.";
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(15_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: requestSignal(signal),
    });
  } catch {
    throw new SearchApiError(
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
      throw new SearchApiError(
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

    throw new SearchApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      envelopeMessage(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return parsed as T;
}

export const searchApi = {
  search: (input: {
    q: string;
    scope: SearchScope;
    limit?: number;
    subjectId?: string;
  }, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      q: input.q,
      scope: input.scope,
      limit: String(input.limit ?? 8),
    });
    if (input.subjectId) query.set("subjectId", input.subjectId);
    return request<SearchResponse>(
      `/search?${query.toString()}`,
      signal,
    );
  },

  contextual: (
    input: {
      subjectLimit?: number;
      resourcesPerSubject?: number;
    } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      subjectLimit: String(input.subjectLimit ?? 6),
      resourcesPerSubject: String(input.resourcesPerSubject ?? 4),
    });
    return request<ContextualDiscoveryResponse>(
      `/discovery/contextual?${query.toString()}`,
      signal,
    );
  },
};

export function isSearchApiError(error: unknown): error is SearchApiError {
  return error instanceof SearchApiError;
}
