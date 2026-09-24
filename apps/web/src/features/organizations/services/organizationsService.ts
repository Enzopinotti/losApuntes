import type {
  AcademicInstitutionOption,
  OrganizationCard,
  OrganizationDetail,
  OrganizationEvent,
  OrganizationManagement,
  OrganizationManagerRole,
  OrganizationPost,
  OrganizationType,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class OrganizationsApiError extends Error {
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
    this.name = "OrganizationsApiError";
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
    throw new OrganizationsApiError(
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
      throw new OrganizationsApiError(
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
    throw new OrganizationsApiError(
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

export function isOrganizationsApiError(
  error: unknown,
): error is OrganizationsApiError {
  return error instanceof OrganizationsApiError;
}

export const organizationsApi = {
  search: (input: { q?: string; type?: OrganizationType; cursor?: string }) => {
    const query = new URLSearchParams({ limit: "25" });
    if (input.q) query.set("q", input.q);
    if (input.type) query.set("type", input.type);
    if (input.cursor) query.set("cursor", input.cursor);
    return request<{ items: OrganizationCard[]; nextCursor: string | null }>(
      `/organizations?${query.toString()}`,
    );
  },

  get: (id: string) =>
    request<{ organization: OrganizationDetail }>(
      `/organizations/${encodeURIComponent(id)}`,
    ),

  management: (id: string) =>
    request<OrganizationManagement>(
      `/organizations/${encodeURIComponent(id)}/manage`,
    ),

  searchInstitutions: async (q: string): Promise<AcademicInstitutionOption[]> => {
    const query = new URLSearchParams({
      kind: "institution",
      q,
      limit: "20",
    });
    const result = await request<{
      items: Array<{ id: string; name: string }>;
    }>(`/academic/catalog/search?${query.toString()}`);
    return result.items.map(({ id, name }) => ({ id, name }));
  },

  create: (input: {
    name: string;
    type: OrganizationType;
    institutionId: string;
    about?: string;
    websiteUrl?: string;
  }) =>
    request<{ organization: OrganizationDetail }>("/organizations", {
      method: "POST",
      body: json(input),
    }),

  update: (
    id: string,
    expectedRevision: number,
    patch: {
      name?: string;
      about?: string | null;
      websiteUrl?: string | null;
      avatarUrl?: string | null;
      coverUrl?: string | null;
    },
  ) =>
    request<{ organization: OrganizationDetail }>(
      `/organizations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: json({ expectedRevision, ...patch }),
      },
    ),

  follow: (id: string) =>
    request<{ following: true; changed: boolean }>(
      `/organizations/${encodeURIComponent(id)}/follow`,
      { method: "PUT" },
    ),

  unfollow: (id: string) =>
    request<{ following: false; changed: boolean }>(
      `/organizations/${encodeURIComponent(id)}/follow`,
      { method: "DELETE" },
    ),

  changeManager: (
    id: string,
    profileId: string,
    role: OrganizationManagerRole,
    expectedManagementRevision: number,
    reason: string,
  ) =>
    request<OrganizationManagement>(
      `/organizations/${encodeURIComponent(
        id,
      )}/managers/${encodeURIComponent(profileId)}`,
      {
        method: "PUT",
        body: json({ role, expectedManagementRevision, reason }),
      },
    ),

  removeManager: (
    id: string,
    profileId: string,
    expectedManagementRevision: number,
    reason: string,
  ) =>
    request<OrganizationManagement>(
      `/organizations/${encodeURIComponent(
        id,
      )}/managers/${encodeURIComponent(profileId)}`,
      {
        method: "DELETE",
        body: json({ expectedManagementRevision, reason }),
      },
    ),

  createPost: (id: string, input: { title?: string; body: string }) =>
    request<{ post: OrganizationPost }>(
      `/organizations/${encodeURIComponent(id)}/posts`,
      { method: "POST", body: json(input) },
    ),

  createEvent: (
    id: string,
    input: {
      title: string;
      description?: string;
      startsAt: string;
      endsAt?: string;
      locationLabel?: string;
      externalUrl?: string;
    },
  ) =>
    request<{ event: OrganizationEvent }>(
      `/organizations/${encodeURIComponent(id)}/events`,
      { method: "POST", body: json(input) },
    ),

  createLink: (id: string, input: { label: string; url: string }) =>
    request<{ link: { id: string; label: string; url: string } }>(
      `/organizations/${encodeURIComponent(id)}/links`,
      { method: "POST", body: json(input) },
    ),

  featureResource: (id: string, resourceId: string) =>
    request<{ featured: true }>(
      `/organizations/${encodeURIComponent(
        id,
      )}/resources/${encodeURIComponent(resourceId)}`,
      { method: "PUT" },
    ),

  reportPost: (id: string, postId: string) =>
    request<{ report: { id: string; status: "pending" } }>(
      `/organizations/${encodeURIComponent(
        id,
      )}/posts/${encodeURIComponent(postId)}/reports`,
      {
        method: "POST",
        body: json({
          reason: "other",
          details: "Reporte enviado desde la interfaz web",
        }),
      },
    ),

  reportEvent: (id: string, eventId: string) =>
    request<{ report: { id: string; status: "pending" } }>(
      `/organizations/${encodeURIComponent(
        id,
      )}/events/${encodeURIComponent(eventId)}/reports`,
      {
        method: "POST",
        body: json({
          reason: "other",
          details: "Reporte enviado desde la interfaz web",
        }),
      },
    ),

  updateVerification: (
    id: string,
    expectedRevision: number,
    verificationState: "unverified" | "verified",
    reason: string,
  ) =>
    request<{ organization: OrganizationDetail; changed: boolean }>(
      `/organizations/${encodeURIComponent(id)}/verification`,
      {
        method: "PATCH",
        body: json({ expectedRevision, verificationState, reason }),
      },
    ),
};
