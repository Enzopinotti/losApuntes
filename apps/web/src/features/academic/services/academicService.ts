import type {
  AcademicAffiliation,
  AcademicCatalogSearchResponse,
  AcademicFollow,
  AcademicLifecycleResponse,
  AcademicRelationshipRole,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class AcademicApiError extends Error {
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
    this.name = "AcademicApiError";
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
    throw new AcademicApiError(
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
      throw new AcademicApiError(
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

    throw new AcademicApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      envelopeMessage(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return parsed as T;
}

export const academicApi = {
  lifecycle: () => request<AcademicLifecycleResponse>("/academic/me/lifecycle"),

  affiliations: () =>
    request<{ affiliations: AcademicAffiliation[] }>(
      "/academic/me/affiliations",
    ),

  graduate: (affiliationId: string, graduatedOn: string) =>
    request<{
      affiliation: AcademicAffiliation;
      transitionedSubjectCount: number;
      lifecycle: AcademicLifecycleResponse;
    }>(
      `/academic/me/affiliations/${encodeURIComponent(affiliationId)}/graduate`,
      {
        method: "POST",
        body: JSON.stringify({ graduatedOn }),
      },
    ),

  updateRoles: (affiliationId: string, roles: AcademicRelationshipRole[]) =>
    request<{
      affiliation: AcademicAffiliation;
      lifecycle: AcademicLifecycleResponse;
    }>(`/academic/me/affiliations/${encodeURIComponent(affiliationId)}/roles`, {
      method: "PATCH",
      body: JSON.stringify({ roles }),
    }),

  follows: () => request<{ follows: AcademicFollow[] }>("/academic/me/follows"),

  follow: (nodeId: string) =>
    request<{
      following: true;
      target: { id: string; kind: "institution" | "program"; name: string };
    }>(`/academic/me/follows/${encodeURIComponent(nodeId)}`, {
      method: "PUT",
    }),

  unfollow: (nodeId: string) =>
    request<void>(`/academic/me/follows/${encodeURIComponent(nodeId)}`, {
      method: "DELETE",
    }),

  searchCatalog: (kind: "institution" | "program", query: string) =>
    request<AcademicCatalogSearchResponse>(
      `/academic/catalog/search?kind=${encodeURIComponent(
        kind,
      )}&q=${encodeURIComponent(query)}&limit=20`,
    ),

  node: (nodeId: string) =>
    request<{ node: { id: string; name: string; kind: string } }>(
      `/academic/catalog/${encodeURIComponent(nodeId)}`,
    ),
};

export function isAcademicApiError(error: unknown): error is AcademicApiError {
  return error instanceof AcademicApiError;
}
