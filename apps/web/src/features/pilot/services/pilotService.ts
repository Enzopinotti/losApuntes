import type {
  PilotHomeResponse,
  PilotMetricsResponse,
  PilotModerationAction,
  PilotModerationResponse,
  PilotModerationStatus,
  PilotReportKind,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class PilotApiError extends Error {
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
    this.name = "PilotApiError";
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
    throw new PilotApiError(
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
      throw new PilotApiError(
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

    throw new PilotApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      envelopeMessage(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return parsed as T;
}

export const pilotApi = {
  home: () => request<PilotHomeResponse>("/pilot/home"),

  metrics: (days = 14) =>
    request<PilotMetricsResponse>(
      `/pilot/admin/metrics?days=${encodeURIComponent(String(days))}`,
    ),

  moderation: (status: PilotModerationStatus = "pending", limit = 50) =>
    request<PilotModerationResponse>(
      `/pilot/admin/moderation?status=${encodeURIComponent(
        status,
      )}&limit=${encodeURIComponent(String(limit))}`,
    ),

  review: (
    kind: PilotReportKind,
    reportId: string,
    action: PilotModerationAction,
    reason: string,
  ) =>
    request<{ item: PilotModerationResponse["items"][number] }>(
      `/pilot/admin/moderation/${encodeURIComponent(
        kind,
      )}/${encodeURIComponent(reportId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      },
    ),
};

export function isPilotApiError(error: unknown): error is PilotApiError {
  return error instanceof PilotApiError;
}
