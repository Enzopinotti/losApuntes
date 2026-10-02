import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_DIAGNOSTIC_LIMITS,
  configureMobileDiagnosticSink,
  createMobileDiagnosticEnvelope,
  installMobileGlobalErrorHandler,
  normalizeMobileDiagnosticSurface,
  reportMobileDiagnostic,
  sanitizeMobileDiagnosticStack,
  type MobileErrorUtils,
} from "../src/features/observability/mobile-diagnostics";

test("normalizes diagnostic surfaces without query, hash or entity identifiers", () => {
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
    assert.equal(normalizeMobileDiagnosticSurface(""), "unknown");
});

test("sanitizes stack evidence before it reaches a diagnostic sink", () => {
  const raw = [
    "Error: request failed for user@example.test",
    "Bearer super-secret-session",
    "https://api.example.test/resource?id=7&token=one-time-proof",
    "file:///Users/enzo/private/project.ts:10:4",
    "/home/runner/work/losApuntes/private.ts:4:2",
    "/app/private/project.ts:3:1",
    "eyJabcdefghijk.abcdefghijklmnop.qwertyuiop",
  ].join("\n");

  const safe = sanitizeMobileDiagnosticStack(raw);
  assert.ok(safe);
  assert.equal(safe?.includes("user@example.test"), false);
  assert.equal(safe?.includes("super-secret-session"), false);
  assert.equal(safe?.includes("one-time-proof"), false);
  assert.equal(safe?.includes("/Users/enzo"), false);
  assert.equal(safe?.includes("/home/runner"), false);
  assert.equal(safe?.includes("/app/private"), false);
  assert.equal(safe?.includes("eyJabcdefghijk"), false);
  assert.ok((safe?.length ?? 0) <= MOBILE_DIAGNOSTIC_LIMITS.stack);
});

test("creates a bounded deterministic envelope without raw private context", () => {
    const error = new TypeError("private token should not become a field");
    error.stack = [
      "TypeError: token=opaque-secret-value",
      "request body: Leonardo short-session-id",
      "second free-form message line",
      "    at render (file:///Users/person/app.tsx:9:1)",
    ].join("\n");

    const context = {
      platform: "ios",
      appVersion: "0.1.0",
      build: "42",
      revision: "abcdef1234567890",
      surface: "/resources/507f1f77bcf86cd799439011?signature=signed",
      now: () => new Date("2026-10-02T04:00:00.000Z"),
    };

    const first = createMobileDiagnosticEnvelope(error, context);
    const second = createMobileDiagnosticEnvelope(error, context);
    const serialized = JSON.stringify(first);

    assert.deepEqual(first, second);
    assert.equal(first.surface, "/resources/:id");
    assert.equal(first.errorClass, "TypeError");
    assert.equal(first.timestamp, "2026-10-02T04:00:00.000Z");
    assert.equal(first.revision, "abcdef1234567890");
    assert.equal(serialized.includes("opaque-secret-value"), false);
    assert.equal(serialized.includes("Leonardo"), false);
    assert.equal(serialized.includes("short-session-id"), false);
    assert.equal(serialized.includes("second free-form message line"), false);
    assert.equal(
      serialized.includes("private token should not become a field"),
      false,
    );
    assert.equal(serialized.includes("signed"), false);
    assert.equal(serialized.includes("/Users/person"), false);
    assert.ok(first.fingerprint.length > 0);
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

test("global JS handler reports bounded evidence and preserves the previous handler", () => {
    const calls: string[] = [];
    const previous = (error: Error, isFatal?: boolean) => {
      calls.push(`previous:${error.name}:${String(isFatal)}`);
    };
    let current = previous;

    const errorUtils: MobileErrorUtils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (handler) => {
        current = handler;
      },
    };

    const cleanup = installMobileGlobalErrorHandler(errorUtils, (error) => {
      calls.push(
        `report:${error instanceof Error ? error.name : "UnknownError"}`,
      );
    });

    current(new TypeError("boom"), true);
    assert.deepEqual(calls, ["report:TypeError", "previous:TypeError:true"]);

    cleanup();
    assert.equal(current, previous);
});

test("drops invalid release revisions instead of emitting arbitrary public env data", () => {
    const envelope = createMobileDiagnosticEnvelope(new Error("boom"), {
      platform: "ios",
      appVersion: "0.1.0",
      build: null,
      revision: "not-a-git-sha-or-safe-release-id",
      surface: "/",
    });

    assert.equal(envelope.revision, null);
});
