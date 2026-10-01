import type {
  AcademicSubjectOption,
  FileUploadIntent,
  ResourceSearchResponse,
  ResourceView,
  ResourceVisibility,
} from "../interfaces";

type ErrorEnvelope = {
  code?: string;
  message?: string | string[];
  requestId?: string;
};

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class ResourcesApiError extends Error {
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
    this.name = "ResourcesApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function apiUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), `${apiBaseUrl}/`).toString();
}

function requestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(15_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function errorMessage(envelope: ErrorEnvelope): string {
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
      signal: requestSignal(init.signal),
    });
  } catch {
    throw new ResourcesApiError(
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
      throw new ResourcesApiError(
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

    throw new ResourcesApiError(
      envelope.code || "REQUEST_FAILED",
      response.status,
      errorMessage(envelope),
      envelope.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }

  return parsed as T;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function isResourcesApiError(
  error: unknown,
): error is ResourcesApiError {
  return error instanceof ResourcesApiError;
}

export const resourcesApi = {
  search: (
    input: {
      q?: string;
      visibility?: ResourceVisibility;
      subjectId?: string;
      cursor?: string;
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (input.q) query.set("q", input.q);
    if (input.visibility) query.set("visibility", input.visibility);
    if (input.subjectId) query.set("subjectId", input.subjectId);
    if (input.cursor) query.set("cursor", input.cursor);
    query.set("limit", "25");
    return request<ResourceSearchResponse>(`/resources?${query.toString()}`, {
      signal,
    });
  },

  saved: (cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("cursor", cursor);
    return request<ResourceSearchResponse>(
      `/resources/saved?${query.toString()}`,
      { signal },
    );
  },

  searchSubjects: async (
    q: string,
    signal?: AbortSignal,
  ): Promise<AcademicSubjectOption[]> => {
    const query = new URLSearchParams({
      kind: "subject",
      q,
      limit: "20",
    });
    const result = await request<{
      items: Array<{ id: string; name: string }>;
    }>(`/academic/catalog/search?${query.toString()}`, { signal });

    return result.items.map(({ id, name }) => ({ id, name }));
  },

  createUploadIntent: (
    file: File,
    operationKey: string,
    signal?: AbortSignal,
  ) =>
    request<FileUploadIntent>("/files/upload-intents", {
      method: "POST",
      signal,
      body: json({
        operationKey,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
      }),
    }),

  uploadDirect: (
    intent: FileUploadIntent["upload"],
    file: File,
    onProgress: (percent: number) => void,
    signal: AbortSignal,
  ) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();

      xhr.open(intent.method, intent.url, true);
      xhr.timeout = 10 * 60 * 1000;

      for (const [name, value] of Object.entries(intent.headers)) {
        xhr.setRequestHeader(name, value);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        signal.removeEventListener("abort", abort);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(
          new ResourcesApiError(
            "STORAGE_UPLOAD_FAILED",
            xhr.status,
            "El almacenamiento rechazó la subida.",
          ),
        );
      };
      xhr.onerror = () => {
        signal.removeEventListener("abort", abort);
        reject(
          new ResourcesApiError(
            "STORAGE_UPLOAD_FAILED",
            0,
            "La subida se interrumpió. Podés reintentar sin perder el formulario.",
          ),
        );
      };
      xhr.ontimeout = xhr.onerror;
      xhr.onabort = () => {
        signal.removeEventListener("abort", abort);
        reject(
          new ResourcesApiError(
            "UPLOAD_CANCELLED",
            0,
            "La subida fue cancelada.",
          ),
        );
      };

      signal.addEventListener("abort", abort, { once: true });
      xhr.send(file);
    }),

  finalize: (fileId: string, signal?: AbortSignal) =>
    request<{ file: { id: string; state: "ready" } }>(
      `/files/${encodeURIComponent(fileId)}/finalize`,
      { method: "POST", signal },
    ),

  create: (
    input: {
      assetId: string;
      title: string;
      description?: string;
      tags: string[];
      subjectId: string;
      visibility: ResourceVisibility;
    },
    signal?: AbortSignal,
  ) =>
    request<{ resource: ResourceView }>("/resources", {
      method: "POST",
      signal,
      body: json(input),
    }),

  update: (
    resource: ResourceView,
    patch: {
      title?: string;
      description?: string | null;
      tags?: string[];
      visibility?: ResourceVisibility;
    },
  ) =>
    request<{ resource: ResourceView }>(
      `/resources/${encodeURIComponent(resource.id)}`,
      {
        method: "PATCH",
        body: json({
          expectedRevision: resource.revision,
          ...patch,
        }),
      },
    ),

  access: (
    resourceId: string,
    disposition: "inline" | "attachment",
    signal?: AbortSignal,
  ) =>
    request<{
      file: ResourceView["file"];
      access: { url: string; expiresAt: string };
    }>(`/resources/${encodeURIComponent(resourceId)}/access`, {
      method: "POST",
      signal,
      body: json({ disposition }),
    }),

  save: (resourceId: string) =>
    request<{ saved: true }>(
      `/resources/${encodeURIComponent(resourceId)}/save`,
      { method: "PUT" },
    ),

  unsave: (resourceId: string) =>
    request<void>(`/resources/${encodeURIComponent(resourceId)}/save`, {
      method: "DELETE",
    }),

  report: (resourceId: string) =>
    request<{ report: { id: string; status: "pending" } }>(
      `/resources/${encodeURIComponent(resourceId)}/reports`,
      {
        method: "POST",
        body: json({
          reason: "other",
          details: "Reporte enviado desde la interfaz web",
        }),
      },
    ),

  share: (resourceId: string, profileId: string) =>
    request<{ shared: true }>(
      `/resources/${encodeURIComponent(
        resourceId,
      )}/shares/${encodeURIComponent(profileId)}`,
      { method: "PUT" },
    ),

  unshare: (resourceId: string, profileId: string) =>
    request<void>(
      `/resources/${encodeURIComponent(
        resourceId,
      )}/shares/${encodeURIComponent(profileId)}`,
      { method: "DELETE" },
    ),
};
