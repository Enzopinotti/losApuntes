import type { ResourceView } from "@losapuntes/contracts";

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000"
).replace(/\/+$/, "");

export interface StudyCollection {
  id: string;
  title: string;
  description: string | null;
  resourceCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionResourceItem {
  resourceId: string;
  resource: ResourceView | null;
}

export class StudyCollectionsApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StudyCollectionsApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await fetch(new URL(path, `${baseUrl}/`).toString(), {
      ...init,
      signal,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new StudyCollectionsApiError(
      "NETWORK_UNAVAILABLE",
      0,
      "No pudimos conectarnos. Revisá tu conexión y volvé a cargar.",
    );
  }
  let payload: unknown;
  try {
    const body = await response.text();
    payload = body ? (JSON.parse(body) as unknown) : null;
  } catch {
    throw new StudyCollectionsApiError(
      "INVALID_RESPONSE",
      response.status,
      "El servidor devolvió una respuesta inválida.",
    );
  }
  if (!response.ok) {
    const error =
      payload && typeof payload === "object"
        ? (payload as { code?: string; message?: string | string[] })
        : {};
    throw new StudyCollectionsApiError(
      error.code ?? "REQUEST_FAILED",
      response.status,
      typeof error.message === "string"
        ? error.message
        : "No pudimos completar la operación.",
    );
  }
  return payload as T;
}

function encode(id: string): string {
  return encodeURIComponent(id);
}

export const studyCollectionsApi = {
  list(cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("cursor", cursor);
    return request<{ items: StudyCollection[]; nextCursor: string | null }>(
      `study-collections?${query.toString()}`,
      { signal },
    );
  },
  get(id: string, signal?: AbortSignal) {
    return request<{ collection: StudyCollection }>(
      `study-collections/${encode(id)}`,
      { signal },
    );
  },
  create(
    input: {
      operationKey: string;
      title: string;
      description?: string;
    },
    signal?: AbortSignal,
  ) {
    return request<{ collection: StudyCollection }>("study-collections", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });
  },
  update(
    id: string,
    input: { title?: string; description?: string; expectedRevision: number },
    signal?: AbortSignal,
  ) {
    return request<{ collection: StudyCollection }>(
      `study-collections/${encode(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        signal,
      },
    );
  },
  delete(id: string, signal?: AbortSignal) {
    return request<void>(`study-collections/${encode(id)}`, {
      method: "DELETE",
      signal,
    });
  },
  resources(id: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("cursor", cursor);
    return request<{
      items: CollectionResourceItem[];
      nextCursor: string | null;
      revision: number;
    }>(`study-collections/${encode(id)}/resources?${query.toString()}`, {
      signal,
    });
  },
  add(id: string, resourceId: string, signal?: AbortSignal) {
    return request<{ collection: StudyCollection }>(
      `study-collections/${encode(id)}/resources/${encode(resourceId)}`,
      { method: "PUT", signal },
    );
  },
  remove(
    id: string,
    resourceId: string,
    signal?: AbortSignal,
    expectedRevision?: number,
  ) {
    const conditional =
      expectedRevision === undefined
        ? ""
        : `?expectedRevision=${encodeURIComponent(String(expectedRevision))}`;
    return request<{ collection: StudyCollection }>(
      `study-collections/${encode(id)}/resources/${encode(resourceId)}${conditional}`,
      { method: "DELETE", signal },
    );
  },
};
