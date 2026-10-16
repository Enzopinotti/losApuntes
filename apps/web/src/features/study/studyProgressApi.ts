import {
  normalizeStudySession,
  type StudySession,
} from "./study-session-plan.mjs";

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000"
).replace(/\/+$/, "");

export class StudyProgressApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StudyProgressApiError";
  }
}

type Progress = { plan: StudySession; revision: number; updatedAt: string };

function parseProgress(input: unknown, subjectId: string): Progress {
  if (!input || typeof input !== "object") {
    throw new StudyProgressApiError(
      "INVALID_RESPONSE",
      200,
      "Respuesta inválida.",
    );
  }
  const wrapper = input as { progress?: unknown };
  const raw = wrapper.progress as
    | {
        plan?: unknown;
        revision?: unknown;
        updatedAt?: unknown;
      }
    | undefined;
  if (
    !raw ||
    !Number.isSafeInteger(raw.revision) ||
    (raw.revision as number) < 1 ||
    typeof raw.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.updatedAt))
  ) {
    throw new StudyProgressApiError(
      "INVALID_RESPONSE",
      200,
      "Guardado inválido.",
    );
  }
  let plan: StudySession;
  try {
    plan = normalizeStudySession(raw.plan);
  } catch {
    throw new StudyProgressApiError(
      "INVALID_RESPONSE",
      200,
      "Plan incompatible.",
    );
  }
  if (plan.subjectId !== subjectId.toLowerCase()) {
    throw new StudyProgressApiError(
      "INVALID_RESPONSE",
      200,
      "La materia no coincide.",
    );
  }
  return { plan, revision: raw.revision as number, updatedAt: raw.updatedAt };
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let result: Response;
  try {
    result = await fetch(new URL(path, baseUrl + "/").toString(), {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    });
  } catch {
    throw new StudyProgressApiError(
      "NETWORK_UNAVAILABLE",
      0,
      "No pudimos conectarnos. Reintentá.",
    );
  }
  let payload: unknown;
  try {
    const text = await result.text();
    payload = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new StudyProgressApiError(
      "INVALID_RESPONSE",
      result.status,
      "El servidor respondió incorrectamente.",
    );
  }
  if (!result.ok) {
    const error =
      payload && typeof payload === "object"
        ? (payload as { code?: string; message?: string })
        : {};
    throw new StudyProgressApiError(
      error.code ?? "REQUEST_FAILED",
      result.status,
      typeof error.message === "string"
        ? error.message
        : "No pudimos completar la operación.",
    );
  }
  return payload;
}

export const studyProgressApi = {
  async get(subjectId: string, signal?: AbortSignal): Promise<Progress> {
    return parseProgress(
      await request("study-progress/" + encodeURIComponent(subjectId), {
        signal,
      }),
      subjectId,
    );
  },
  async save(
    subjectId: string,
    plan: StudySession,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<Progress> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new StudyProgressApiError(
        "INVALID_REVISION",
        0,
        "Revisión inválida.",
      );
    }
    const normalized = normalizeStudySession(plan);
    if (normalized.subjectId !== subjectId.toLowerCase()) {
      throw new StudyProgressApiError(
        "SUBJECT_MISMATCH",
        0,
        "Materia inválida.",
      );
    }
    return parseProgress(
      await request("study-progress/" + encodeURIComponent(subjectId), {
        method: "PUT",
        body: JSON.stringify({ expectedRevision, plan: normalized }),
        signal,
      }),
      subjectId,
    );
  },
  async remove(
    subjectId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new StudyProgressApiError(
        "INVALID_REVISION",
        0,
        "Revisión inválida.",
      );
    }
    const value = await request(
      "study-progress/" + encodeURIComponent(subjectId),
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision }),
        signal,
      },
    );
    if (
      !value ||
      typeof value !== "object" ||
      (value as { deleted?: unknown }).deleted !== true
    ) {
      throw new StudyProgressApiError(
        "INVALID_RESPONSE",
        200,
        "Resultado inválido.",
      );
    }
  },
};

export function isStudyProgressApiError(
  error: unknown,
): error is StudyProgressApiError {
  return error instanceof StudyProgressApiError;
}
