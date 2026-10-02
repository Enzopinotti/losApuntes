export const MOBILE_DIAGNOSTIC_LIMITS = Object.freeze({
  surface: 120,
  metadata: 80,
  stack: 2400,
  stackLines: 12,
});

export type MobileDiagnosticPlatform = "ios" | "android" | "web" | "unknown";

export type MobileDiagnosticContext = {
  platform: string;
  appVersion: string | null;
  build: string | null;
  revision: string | null;
  surface: string;
  now?: (() => Date) | undefined;
};

export type MobileDiagnosticEnvelope = Readonly<{
  platform: MobileDiagnosticPlatform;
  appVersion: string | null;
  build: string | null;
  revision: string | null;
  surface: string;
  errorClass: string;
  fingerprint: string;
  stack: string | null;
  timestamp: string;
}>;

export type MobileDiagnosticSink = (envelope: MobileDiagnosticEnvelope) => void;

export type MobileGlobalErrorHandler = (
  error: Error,
  isFatal?: boolean,
) => void;

export type MobileErrorUtils = {
  getGlobalHandler(): MobileGlobalErrorHandler | null | undefined;
  setGlobalHandler(handler: MobileGlobalErrorHandler): void;
};

const dynamicParentSegments = new Set([
  "organizations",
  "profiles",
  "questions",
  "resources",
  "sessions",
  "users",
]);

function clamp(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function safeMetadata(value: string | null): string | null {
  if (!value) return null;
  const safe = value.trim().replace(/[^A-Za-z0-9._-]+/gu, "-");
  return safe ? clamp(safe, MOBILE_DIAGNOSTIC_LIMITS.metadata) : null;
}

function safeRevision(value: string | null): string | null {
  if (!value) return null;
  const revision = value.trim();
  return /^[a-f\d]{7,64}$/iu.test(revision) ? revision : null;
}

function normalizeSurfaceSegment(
  segment: string,
  previousSegment: string | undefined,
): string {
  if (!segment) return segment;
  if (dynamicParentSegments.has(previousSegment ?? "")) return ":id";
  if (
    segment.includes("@") ||
    /^\d+$/u.test(segment) ||
    /^[a-f\d]{24,}$/iu.test(segment) ||
    /^[a-f\d]{8}-[a-f\d-]{27,}$/iu.test(segment) ||
    segment.length > 32
  ) {
    return ":id";
  }
  return segment.replace(/[^A-Za-z0-9._~-]+/gu, "-");
}

export function normalizeMobileDiagnosticSurface(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";

  let path = trimmed;
  try {
    if (/^https?:\/\//iu.test(trimmed)) {
      path = new URL(trimmed).pathname;
    }
  } catch {
    path = trimmed;
  }

  path = path.split(/[?#]/u, 1)[0] ?? "";
  if (!path.startsWith("/")) path = `/${path}`;

  const segments = path.split("/");
  const normalized = segments.map((segment, index) =>
    normalizeSurfaceSegment(segment, segments[index - 1]),
  );
  const surface = normalized.join("/").replace(/\/{2,}/gu, "/") || "/";
  return clamp(surface, MOBILE_DIAGNOSTIC_LIMITS.surface);
}

function stripUrlSecrets(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) => {
    try {
      const url = new URL(candidate);
      return `${url.origin}${normalizeMobileDiagnosticSurface(url.pathname)}`;
    } catch {
      return "<url>";
    }
  });
}

export function sanitizeMobileDiagnosticStack(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let safe = stripUrlSecrets(raw)
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu,
      "Bearer <redacted>",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/gu,
      "<redacted-token>",
    )
    .replace(
      /\b(token|code|proof|secret|session|authorization|signature|sig|key)=([^\s&#)]+)/giu,
      "$1=<redacted>",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      "<email>",
    )
    .replace(/file:\/\/\/[^\s)]+/giu, "file://<path>")
    .replace(
      /(?:\/Users|\/home|\/var|\/tmp|\/private|\/storage\/emulated\/\d+|\/data\/user\/\d+)[^\s)]*/gu,
      "<path>",
    )
    .replace(/(\(|\s)\/[^)\s]+/gu, "$1<path>")
    .replace(/[A-Za-z]:\\[^\s)]+/gu, "<path>")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/gu, "<redacted-token>");

  safe = safe
    .split("\n")
    .slice(0, MOBILE_DIAGNOSTIC_LIMITS.stackLines)
    .join("\n")
    .trim();

  if (!safe) return null;
  return clamp(safe, MOBILE_DIAGNOSTIC_LIMITS.stack);
}

function normalizePlatform(platform: string): MobileDiagnosticPlatform {
  if (platform === "ios" || platform === "android" || platform === "web") {
    return platform;
  }
  return "unknown";
}

function safeErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const safe = name.replace(/[^A-Za-z0-9._-]+/gu, "");
  return clamp(safe || "Error", 64);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createMobileDiagnosticEnvelope(
  error: unknown,
  context: MobileDiagnosticContext,
): MobileDiagnosticEnvelope {
  const errorClass = safeErrorClass(error);
  const rawFrames =
    error instanceof Error
      ? error.stack?.split("\n").slice(1).join("\n")
      : null;
  const stack = sanitizeMobileDiagnosticStack(rawFrames);
  const fingerprintSource = [
    errorClass,
    ...(stack?.split("\n").slice(0, 3) ?? []),
  ].join("|");

  return Object.freeze({
    platform: normalizePlatform(context.platform),
    appVersion: safeMetadata(context.appVersion),
    build: safeMetadata(context.build),
    revision: safeRevision(context.revision),
    surface: normalizeMobileDiagnosticSurface(context.surface),
    errorClass,
    fingerprint: fnv1a(fingerprintSource),
    stack,
    timestamp: (context.now?.() ?? new Date()).toISOString(),
  });
}

const defaultMobileDiagnosticSink: MobileDiagnosticSink = (envelope) => {
  console.error("[losapuntes-mobile-diagnostic]", JSON.stringify(envelope));
};

let mobileDiagnosticSink: MobileDiagnosticSink = defaultMobileDiagnosticSink;

export function configureMobileDiagnosticSink(
  sink: MobileDiagnosticSink,
): () => void {
  const previous = mobileDiagnosticSink;
  mobileDiagnosticSink = sink;
  return () => {
    if (mobileDiagnosticSink === sink) mobileDiagnosticSink = previous;
  };
}

export function reportMobileDiagnostic(
  error: unknown,
  context: MobileDiagnosticContext,
): MobileDiagnosticEnvelope {
  const envelope = createMobileDiagnosticEnvelope(error, context);
  try {
    mobileDiagnosticSink(envelope);
  } catch {
    // Diagnostics must never prevent the recovery UI or previous global handler.
  }
  return envelope;
}

export function installMobileGlobalErrorHandler(
  errorUtils: MobileErrorUtils | null | undefined,
  report: (error: unknown) => void,
): () => void {
  if (!errorUtils) return () => undefined;

  const previous = errorUtils.getGlobalHandler();
  const handler: MobileGlobalErrorHandler = (error, isFatal) => {
    try {
      report(error);
    } finally {
      previous?.(error, isFatal);
    }
  };

  errorUtils.setGlobalHandler(handler);

  return () => {
    if (previous && errorUtils.getGlobalHandler() === handler) {
      errorUtils.setGlobalHandler(previous);
    }
  };
}
