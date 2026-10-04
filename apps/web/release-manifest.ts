export type WebReleaseManifest =
  | Readonly<{
      status: "available";
      service: "web";
      releaseId: string;
      sourceSha: string;
      apiOrigin: string;
    }>
  | Readonly<{
      status: "unavailable";
      service: "web";
    }>;

export type WebReleaseManifestInput = {
  releaseId?: string | null | undefined;
  sourceSha?: string | null | undefined;
  apiOrigin?: string | null | undefined;
};

export type ApiReleaseObservationInput = {
  status?: string | null | undefined;
  service?: string | null | undefined;
  releaseId?: string | null | undefined;
  sourceSha?: string | null | undefined;
  apiOrigin?: string | null | undefined;
};

export type WebReleaseBlocker =
  | "WEB_RELEASE_UNAVAILABLE"
  | "INSECURE_API_ORIGIN"
  | "API_RELEASE_UNAVAILABLE"
  | "API_ORIGIN_MISMATCH"
  | "SOURCE_SHA_MISMATCH";

export type WebReleaseQualification = Readonly<{
  status: "qualified" | "blocked";
  webRelease: WebReleaseManifest;
  blockers: readonly WebReleaseBlocker[];
}>;

const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SOURCE_SHA_PATTERN = /^[a-f\d]{40}$/iu;

export function normalizeWebReleaseId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return RELEASE_ID_PATTERN.test(value) ? value : null;
}

export function normalizeWebSourceSha(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return SOURCE_SHA_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function normalizeWebApiOrigin(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  return url.origin;
}

export function createWebReleaseManifest(
  input: WebReleaseManifestInput,
): WebReleaseManifest {
  const releaseId = normalizeWebReleaseId(input.releaseId);
  const sourceSha = normalizeWebSourceSha(input.sourceSha);
  const apiOrigin = normalizeWebApiOrigin(input.apiOrigin);

  if (!releaseId || !sourceSha || !apiOrigin) {
    return Object.freeze({
      status: "unavailable" as const,
      service: "web" as const,
    });
  }

  return Object.freeze({
    status: "available" as const,
    service: "web" as const,
    releaseId,
    sourceSha,
    apiOrigin,
  });
}

function normalizeApiReleaseObservation(
  input: ApiReleaseObservationInput | null | undefined,
): Readonly<{
  releaseId: string;
  sourceSha: string;
  apiOrigin: string;
}> | null {
  if (!input || input.status !== "available" || input.service !== "api") {
    return null;
  }

  const releaseId = normalizeWebReleaseId(input.releaseId);
  const sourceSha = normalizeWebSourceSha(input.sourceSha);
  const apiOrigin = normalizeWebApiOrigin(input.apiOrigin);

  if (!releaseId || !sourceSha || !apiOrigin) {
    return null;
  }

  return Object.freeze({ releaseId, sourceSha, apiOrigin });
}

export function qualifyWebRelease(
  webRelease: WebReleaseManifest,
  apiReleaseInput: ApiReleaseObservationInput | null | undefined,
): WebReleaseQualification {
  const blockers: WebReleaseBlocker[] = [];

  if (webRelease.status !== "available") {
    blockers.push("WEB_RELEASE_UNAVAILABLE");
  } else if (new URL(webRelease.apiOrigin).protocol !== "https:") {
    blockers.push("INSECURE_API_ORIGIN");
  }

  const apiRelease = normalizeApiReleaseObservation(apiReleaseInput);
  if (!apiRelease) {
    blockers.push("API_RELEASE_UNAVAILABLE");
  }

  if (webRelease.status === "available" && apiRelease) {
    if (webRelease.apiOrigin !== apiRelease.apiOrigin) {
      blockers.push("API_ORIGIN_MISMATCH");
    }
    if (webRelease.sourceSha !== apiRelease.sourceSha) {
      blockers.push("SOURCE_SHA_MISMATCH");
    }
  }

  return Object.freeze({
    status: blockers.length === 0 ? "qualified" : "blocked",
    webRelease,
    blockers: Object.freeze(blockers),
  });
}
