export const MOBILE_DIAGNOSTIC_LIMITS = Object.freeze({
  surface: 120,
  metadata: 80,
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
  stack: null;
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

const staticSurfaceSegments = new Set([
  "create",
  "home",
  "network",
  "profile",
  "profiles",
  "questions",
  "register",
  "resources",
  "search",
  "sign-in",
  "verify-email",
]);

const dynamicParentSegments = new Set([
  "profiles",
  "questions",
  "resources",
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
  return staticSurfaceSegments.has(segment) ? segment : ":segment";
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

function safeStringProperty(value: unknown, property: "name"): string | null {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return null;
  }

  try {
    const candidate = Reflect.get(value, property);
    return typeof candidate === "string" ? candidate : null;
  } catch {
    return null;
  }
}

const knownErrorClasses = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

function safeErrorClass(error: unknown): string {
  const name = safeStringProperty(error, "name");
  return name && knownErrorClasses.has(name) ? name : "Error";
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
  const surface = normalizeMobileDiagnosticSurface(context.surface);

  return Object.freeze({
    platform: normalizePlatform(context.platform),
    appVersion: safeMetadata(context.appVersion),
    build: safeMetadata(context.build),
    revision: safeRevision(context.revision),
    surface,
    errorClass,
    fingerprint: fnv1a(`${errorClass}|${surface}`),
    stack: null,
    timestamp: (context.now?.() ?? new Date()).toISOString(),
  });
}

function normalizePlatform(platform: string): MobileDiagnosticPlatform {
  if (platform === "ios" || platform === "android" || platform === "web") {
    return platform;
  }
  return "unknown";
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
    // Diagnostics must never prevent recovery or the previous global handler.
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
    } catch {
      // A diagnostic adapter must never create a second unhandled exception.
    }
    previous?.(error, isFatal);
  };

  errorUtils.setGlobalHandler(handler);

  return () => {
    if (previous && errorUtils.getGlobalHandler() === handler) {
      errorUtils.setGlobalHandler(previous);
    }
  };
}
