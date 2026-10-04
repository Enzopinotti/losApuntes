import {
  normalizeMobileApiOrigin,
  normalizeMobileSourceSha,
  type MobileServerReleaseObservationInput,
} from "./release-qualification";

const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const RELEASE_OBSERVATION_TIMEOUT_MS = 15_000;

type ApiReleasePayload = {
  status?: unknown;
  service?: unknown;
  releaseId?: unknown;
  sourceSha?: unknown;
};

export type MobileReleaseFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

function isRecord(value: unknown): value is ApiReleasePayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function observeMobileServerRelease(
  rawApiOrigin: string,
  fetcher: MobileReleaseFetch = fetch,
): Promise<MobileServerReleaseObservationInput | null> {
  let apiOrigin: string;
  try {
    apiOrigin = normalizeMobileApiOrigin(rawApiOrigin);
  } catch {
    return null;
  }

  const endpoint = new URL("/health/release", apiOrigin).toString();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    RELEASE_OBSERVATION_TIMEOUT_MS,
  );

  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      payload.status !== "available" ||
      payload.service !== "api" ||
      typeof payload.releaseId !== "string" ||
      !RELEASE_ID_PATTERN.test(payload.releaseId)
    ) {
      return null;
    }

    const sourceSha = normalizeMobileSourceSha(
      typeof payload.sourceSha === "string" ? payload.sourceSha : null,
    );
    if (!sourceSha) return null;

    return Object.freeze({
      source: "api-observation" as const,
      apiOrigin,
      releaseId: payload.releaseId,
      sourceSha,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
