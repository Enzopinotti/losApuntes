import assert from "node:assert/strict";
import test from "node:test";

import {
  configureMobileDiagnosticSink,
  createMobileDiagnosticEnvelope,
  installMobileGlobalErrorHandler,
  normalizeMobileDiagnosticSurface,
  reportMobileDiagnostic,
  type MobileErrorUtils,
} from "../src/features/observability/mobile-diagnostics";

test("normalizes surfaces without query, hash or arbitrary path segments", () => {
  assert.equal(
    normalizeMobileDiagnosticSurface(
      "/questions/507f1f77bcf86cd799439011?token=secret#proof",
    ),
    "/questions/:id",
  );
  assert.equal(
    normalizeMobileDiagnosticSurface(
      "https://app.example.test/profiles/123456?email=user@example.test",
    ),
    "/profiles/:id",
  );
  assert.equal(
    normalizeMobileDiagnosticSurface("/unexpected/Leonardo/private"),
    "/:segment/:segment/:segment",
  );
  assert.equal(normalizeMobileDiagnosticSurface(""), "unknown");
});

test("never emits raw stack, messages, function labels or source paths", () => {
  const error = new TypeError(
    [
      "token=opaque-secret-value",
      "at Leonardo short-session-id",
      "at Leonardo (/app/private/project.ts:7:3)",
    ].join("\n"),
  );
  error.stack = [
    "TypeError: token=opaque-secret-value",
    "at Leonardo short-session-id",
    "at Leonardo (/app/private/project.ts:7:3)",
    "at render (file:///Users/person/app.tsx:9:1)",
  ].join("\n");

  const envelope = createMobileDiagnosticEnvelope(error, {
    platform: "ios",
    appVersion: "0.1.0",
    build: "42",
    revision: "abcdef1234567890",
    surface: "/resources/507f1f77bcf86cd799439011?signature=signed",
    now: () => new Date("2026-10-02T04:00:00.000Z"),
  });
  const serialized = JSON.stringify(envelope);

  assert.equal(envelope.stack, null);
  assert.equal(envelope.surface, "/resources/:id");
  assert.equal(serialized.includes("opaque-secret-value"), false);
  assert.equal(serialized.includes("Leonardo"), false);
  assert.equal(serialized.includes("short-session-id"), false);
  assert.equal(serialized.includes("/app/private"), false);
  assert.equal(serialized.includes("/Users/person"), false);
  assert.equal(serialized.includes("signed"), false);
});

test("fingerprints use only normalized error class and surface", () => {
  const first = createMobileDiagnosticEnvelope(new Error("private one"), {
    platform: "android",
    appVersion: "0.1.0",
    build: "7",
    revision: null,
    surface: "/questions/one",
  });
  const second = createMobileDiagnosticEnvelope(new Error("private two"), {
    platform: "android",
    appVersion: "0.1.0",
    build: "7",
    revision: null,
    surface: "/questions/two",
  });

  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.surface, "/questions/:id");
  assert.equal(second.surface, "/questions/:id");
});

test("malformed Error accessors cannot break envelope construction", () => {
  const malformed = new Error("private");
  Object.defineProperty(malformed, "name", {
    configurable: true,
    get() {
      throw new Error("name getter failed");
    },
  });
  Object.defineProperty(malformed, "stack", {
    configurable: true,
    get() {
      throw new Error("stack getter failed");
    },
  });

  assert.doesNotThrow(() =>
    createMobileDiagnosticEnvelope(malformed, {
      platform: "ios",
      appVersion: "0.1.0",
      build: null,
      revision: null,
      surface: "/",
    }),
  );

  const envelope = createMobileDiagnosticEnvelope(malformed, {
    platform: "ios",
    appVersion: "0.1.0",
    build: null,
    revision: null,
    surface: "/",
  });
  assert.equal(envelope.errorClass, "Error");
  assert.equal(envelope.stack, null);
});

test("arbitrary Error.name never enters the diagnostic envelope", () => {
  const error = new Error("private");
  error.name = "Leonardo";

  const envelope = createMobileDiagnosticEnvelope(error, {
    platform: "ios",
    appVersion: "0.1.0",
    build: null,
    revision: null,
    surface: "/",
  });
  const serialized = JSON.stringify(envelope);

  assert.equal(envelope.errorClass, "Error");
  assert.equal(serialized.includes("Leonardo"), false);
});

test("a diagnostic sink failure never prevents caller recovery", () => {
  const restore = configureMobileDiagnosticSink(() => {
    throw new Error("provider unavailable");
  });

  try {
    assert.doesNotThrow(() =>
      reportMobileDiagnostic(new Error("render failed"), {
        platform: "android",
        appVersion: "0.1.0",
        build: "7",
        revision: null,
        surface: "/",
      }),
    );
  } finally {
    restore();
  }
});

test("global JS handler preserves the previous handler if reporting throws", () => {
  const calls: string[] = [];
  const previousInputs: Array<{
    name: string;
    message: string;
    stack: string | undefined;
    isFatal: boolean | undefined;
  }> = [];
  const previous = (error: Error, isFatal?: boolean) => {
    calls.push(`previous:${error.name}:${String(isFatal)}`);
    previousInputs.push({
      name: error.name,
      message: error.message,
      stack: error.stack,
      isFatal,
    });
  };
  let current = previous;

  const errorUtils: MobileErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler: (handler) => {
      current = handler;
    },
  };

  const cleanup = installMobileGlobalErrorHandler(errorUtils, () => {
    calls.push("report");
    throw new Error("diagnostic adapter failed");
  });

  assert.doesNotThrow(() =>
    current(new TypeError("Bearer secret-token user@example.test"), true),
  );
  assert.deepEqual(calls, ["report", "previous:TypeError:true"]);
  assert.deepEqual(previousInputs, [
    {
      name: "TypeError",
      message: "Client runtime failure",
      stack: "",
      isFatal: true,
    },
  ]);

  cleanup();
  assert.equal(current, previous);
});

test("drops invalid release revisions instead of emitting arbitrary env data", () => {
  const envelope = createMobileDiagnosticEnvelope(new Error("boom"), {
    platform: "ios",
    appVersion: "0.1.0",
    build: null,
    revision: "not-a-git-sha-or-safe-release-id",
    surface: "/",
  });

  assert.equal(envelope.revision, null);
});

test("drops non-public app version and build metadata", () => {
  const envelope = createMobileDiagnosticEnvelope(new Error("private"), {
    platform: "ios",
    appVersion: "1.2.3-enzo@example.test",
    build: "release-person-name",
    revision: null,
    surface: "/",
  });
  const serialized = JSON.stringify(envelope);

  assert.equal(envelope.appVersion, null);
  assert.equal(envelope.build, null);
  assert.equal(serialized.includes("enzo"), false);
  assert.equal(serialized.includes("person-name"), false);
});

test("falls back to a generated timestamp when an injected clock is malformed", () => {
  const envelope = createMobileDiagnosticEnvelope(new Error("private"), {
    platform: "android",
    appVersion: "0.1.0",
    build: "7",
    revision: null,
    surface: "/",
    now: () => ({ toISOString: () => "email@example.test" }) as unknown as Date,
  });

  assert.match(envelope.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(envelope.timestamp.includes("example.test"), false);
});
