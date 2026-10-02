export type MobileReleaseEnvironment = "development" | "production";

export type MobileApiTransport = "https" | "local-http" | "insecure-http";

export type MobileReleaseBlocker =
  | "DEVELOPMENT_BUILD"
  | "INSECURE_API_ORIGIN"
  | "MISSING_APP_VERSION"
  | "MISSING_BUILD_ID"
  | "MISSING_DISTRIBUTION_PROFILE"
  | "MISSING_SERVER_RELEASE_ID"
  | "MISSING_SOURCE_SHA";

export type MobileReleaseIdentity = Readonly<{
  environment: MobileReleaseEnvironment;
  sourceSha: string | null;
  appVersion: string | null;
  build: string | null;
  distributionProfile: string | null;
  apiOrigin: string;
  apiTransport: MobileApiTransport;
}>;

export type MobileReleaseQualification = Readonly<{
  status: "qualified" | "blocked";
  identity: MobileReleaseIdentity;
  serverReleaseId: string | null;
  blockers: readonly MobileReleaseBlocker[];
}>;

export type MobileReleaseIdentityInput = {
  environment: MobileReleaseEnvironment;
  apiOrigin: string;
  sourceSha?: string | null | undefined;
  appVersion?: string | null | undefined;
  build?: string | number | null | undefined;
  distributionProfile?: string | null | undefined;
};

const RELEASE_TOKEN_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SOURCE_SHA_PATTERN = /^[a-f\d]{40}$/iu;

function normalizeBoundedToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return RELEASE_TOKEN_PATTERN.test(value) ? value : null;
}

export function normalizeMobileSourceSha(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return SOURCE_SHA_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function normalizeMobileApiOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Mobile API origin must be an absolute HTTP(S) origin");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Mobile API origin must be an absolute HTTP(S) origin");
  }

  return url.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function classifyApiTransport(apiOrigin: string): MobileApiTransport {
  const url = new URL(apiOrigin);
  if (url.protocol === "https:") return "https";
  return isLoopbackHostname(url.hostname) ? "local-http" : "insecure-http";
}

export function createMobileReleaseIdentity(
  input: MobileReleaseIdentityInput,
): MobileReleaseIdentity {
  const apiOrigin = normalizeMobileApiOrigin(input.apiOrigin);
  const build =
    input.build === null || input.build === undefined
      ? null
      : normalizeBoundedToken(String(input.build));

  return Object.freeze({
    environment: input.environment,
    sourceSha: normalizeMobileSourceSha(input.sourceSha),
    appVersion: normalizeBoundedToken(input.appVersion),
    build,
    distributionProfile: normalizeBoundedToken(input.distributionProfile),
    apiOrigin,
    apiTransport: classifyApiTransport(apiOrigin),
  });
}

export function qualifyMobileRelease(
  identity: MobileReleaseIdentity,
  observedServerReleaseId: string | null | undefined,
): MobileReleaseQualification {
  const blockers: MobileReleaseBlocker[] = [];
  const serverReleaseId = normalizeBoundedToken(observedServerReleaseId);

  if (identity.environment !== "production") {
    blockers.push("DEVELOPMENT_BUILD");
  }
  if (identity.apiTransport !== "https") {
    blockers.push("INSECURE_API_ORIGIN");
  }
  if (!identity.sourceSha) {
    blockers.push("MISSING_SOURCE_SHA");
  }
  if (!identity.appVersion) {
    blockers.push("MISSING_APP_VERSION");
  }
  if (!identity.build) {
    blockers.push("MISSING_BUILD_ID");
  }
  if (!identity.distributionProfile) {
    blockers.push("MISSING_DISTRIBUTION_PROFILE");
  }
  if (!serverReleaseId) {
    blockers.push("MISSING_SERVER_RELEASE_ID");
  }

  return Object.freeze({
    status: blockers.length === 0 ? "qualified" : "blocked",
    identity,
    serverReleaseId,
    blockers: Object.freeze(blockers),
  });
}
