export const WEB_DIAGNOSTIC_LIMITS = Object.freeze({
  surface: 120,
  metadata: 80,
});

export type WebDiagnosticContext = {
  appVersion: string | null;
  build: string | null;
  revision: string | null;
  surface: string;
  now?: (() => Date) | undefined;
};

export type WebDiagnosticEnvelope = Readonly<{
  platform: "web";
  appVersion: string | null;
  build: string | null;
  revision: string | null;
  surface: string;
  errorClass: string;
  fingerprint: string;
  stack: null;
  timestamp: string;
}>;

export type WebDiagnosticSink = (
  envelope: WebDiagnosticEnvelope,
) => void | PromiseLike<void>;

export type WebDiagnosticEventTarget = {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
};

const staticSurfaceSegments = new Set([
  "academic",
  "account",
  "admin",
  "auth",
  "dashboard",
  "feeds",
  "forgot-password",
  "lifecycle",
  "login",
  "manage",
  "network",
  "notifications",
  "organizations",
  "p",
  "pending",
  "pilot",
  "profile",
  "questions",
  "reset-password",
  "resources",
  "restricted",
  "search",
  "security",
  "settings",
  "sign-up",
  "verify-email",
]);

const dynamicParentSegments = new Set([
  "organizations",
  "p",
  "questions",
  "resources",
]);

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

function clamp(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function safeMetadata(value: string | null): string | null {
  if (!value) return null;
  const safe = value.trim().replace(/[^A-Za-z0-9._-]+/gu, "-");
  return safe ? clamp(safe, WEB_DIAGNOSTIC_LIMITS.metadata) : null;
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

export function normalizeWebDiagnosticSurface(raw: string): string {
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
  return clamp(surface, WEB_DIAGNOSTIC_LIMITS.surface);
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

export function createWebDiagnosticEnvelope(
  error: unknown,
  context: WebDiagnosticContext,
): WebDiagnosticEnvelope {
  const errorClass = safeErrorClass(error);
  const surface = normalizeWebDiagnosticSurface(context.surface);

  return Object.freeze({
    platform: "web",
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

const defaultWebDiagnosticSink: WebDiagnosticSink = (envelope) => {
  console.error("[losapuntes-web-diagnostic]", JSON.stringify(envelope));
};

let webDiagnosticSink: WebDiagnosticSink = defaultWebDiagnosticSink;

export function configureWebDiagnosticSink(
  sink: WebDiagnosticSink,
): () => void {
  const previous = webDiagnosticSink;
  webDiagnosticSink = sink;
  return () => {
    if (webDiagnosticSink === sink) webDiagnosticSink = previous;
  };
}

export function reportWebDiagnostic(
  error: unknown,
  context: WebDiagnosticContext,
): WebDiagnosticEnvelope {
  const envelope = createWebDiagnosticEnvelope(error, context);
  try {
    const delivery = webDiagnosticSink(envelope);
    if (delivery) {
      void Promise.resolve(delivery).catch(() => undefined);
    }
  } catch {
    // Diagnostics must never interfere with app recovery.
  }
  return envelope;
}

export function installWebGlobalDiagnosticHandlers(
  target: WebDiagnosticEventTarget,
  report: (error: unknown) => void,
): () => void {
  const onError: EventListener = (event) => {
    const errorEvent = event as ErrorEvent;
    try {
      report(errorEvent.error ?? new Error());
    } catch {
      // Reporting failures must not interfere with the browser error lifecycle.
    }
  };

  const onUnhandledRejection: EventListener = (event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    try {
      report(rejectionEvent.reason);
    } catch {
      // Reporting failures must not interfere with the browser rejection lifecycle.
    }
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
