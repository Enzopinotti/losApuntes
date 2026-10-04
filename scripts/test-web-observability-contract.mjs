import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  configureWebDiagnosticSink,
  createWebDiagnosticEnvelope,
  installWebGlobalDiagnosticHandlers,
  normalizeWebDiagnosticSurface,
  reportWebDiagnostic,
} from "../apps/web/src/features/observability/web-diagnostics.ts";

assert.equal(
  normalizeWebDiagnosticSurface(
    "/questions/507f1f77bcf86cd799439011?token=secret#proof",
  ),
  "/questions/:id",
);
assert.equal(
  normalizeWebDiagnosticSurface(
    "https://app.example.test/p/private-person?email=user@example.test",
  ),
  "/p/:id",
);
assert.equal(
  normalizeWebDiagnosticSurface("/unexpected/Leonardo/private"),
  "/:segment/:segment/:segment",
);

assert.equal(normalizeWebDiagnosticSurface("/login"), "/login");
assert.equal(normalizeWebDiagnosticSurface("/dashboard"), "/dashboard");
assert.equal(normalizeWebDiagnosticSurface("/notifications"), "/notifications");
assert.equal(
  normalizeWebDiagnosticSurface("/organizations/org-secret/manage"),
  "/organizations/:id/manage",
);
assert.equal(normalizeWebDiagnosticSurface("/p/private-profile-id"), "/p/:id");

const error = new TypeError("token=opaque-secret-value user@example.test");
error.stack = [
  "TypeError: token=opaque-secret-value",
  "at Leonardo (/Users/person/private/app.tsx:9:1)",
  "https://signed.example.test/object?signature=private",
].join("\n");

const envelope = createWebDiagnosticEnvelope(error, {
  appVersion: "0.1.0",
  build: "web-42",
  revision: "abcdef1234567890",
  surface: "/resources/secret-id?signature=signed#token",
  now: () => new Date("2026-10-03T20:00:00.000Z"),
});
const serialized = JSON.stringify(envelope);

assert.equal(envelope.platform, "web");
assert.equal(envelope.surface, "/resources/:id");
assert.equal(envelope.stack, null);
assert.equal(serialized.includes("opaque-secret-value"), false);
assert.equal(serialized.includes("user@example.test"), false);
assert.equal(serialized.includes("Leonardo"), false);
assert.equal(serialized.includes("/Users/person"), false);
assert.equal(serialized.includes("signature"), false);
assert.equal(serialized.includes("secret-id"), false);

const unsafeMetadata = createWebDiagnosticEnvelope(new Error("private"), {
  appVersion: "1.2.3-enzo",
  build: "release-person-name",
  revision: null,
  surface: "/",
});
assert.equal(unsafeMetadata.appVersion, null);
assert.equal(unsafeMetadata.build, null);

const first = createWebDiagnosticEnvelope(new Error("private one"), {
  appVersion: "0.1.0",
  build: "web-42",
  revision: null,
  surface: "/questions/one",
});
const second = createWebDiagnosticEnvelope(new Error("private two"), {
  appVersion: "0.1.0",
  build: "web-42",
  revision: null,
  surface: "/questions/two",
});
assert.equal(first.fingerprint, second.fingerprint);

const malformed = new Error("private");
Object.defineProperty(malformed, "name", {
  configurable: true,
  get() {
    throw new Error("name getter failed");
  },
});
assert.doesNotThrow(() =>
  createWebDiagnosticEnvelope(malformed, {
    appVersion: null,
    build: null,
    revision: null,
    surface: "/",
  }),
);

const restoreSink = configureWebDiagnosticSink(() => {
  throw new Error("provider unavailable");
});
try {
  assert.doesNotThrow(() =>
    reportWebDiagnostic(new Error("render failed"), {
      appVersion: null,
      build: null,
      revision: null,
      surface: "/",
    }),
  );
} finally {
  restoreSink();
}

const asyncSinkRejections = [];
const restoreAsyncSink = configureWebDiagnosticSink(async () => {
  throw new Error("async provider unavailable");
});
try {
  const rejectionProbe = new Promise((resolve) => {
    const onUnhandled = (reason) => {
      asyncSinkRejections.push(reason);
      resolve();
    };
    process.once("unhandledRejection", onUnhandled);
    setTimeout(() => {
      process.removeListener("unhandledRejection", onUnhandled);
      resolve();
    }, 20);
  });

  reportWebDiagnostic(new Error("render failed"), {
    appVersion: null,
    build: null,
    revision: null,
    surface: "/dashboard",
  });
  await rejectionProbe;
  assert.equal(asyncSinkRejections.length, 0);
} finally {
  restoreAsyncSink();
}

const listeners = new Map();
const target = {
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  },
};

const reported = [];
const cleanup = installWebGlobalDiagnosticHandlers(target, (value) => {
  reported.push(value);
});

listeners.get("error")?.({ error: new TypeError("boom") });
listeners.get("unhandledrejection")?.({ reason: new RangeError("rejected") });
const prevented = [];
listeners.get("error")?.({
  error: new TypeError("raw private error"),
  preventDefault() {
    prevented.push("error");
  },
});
listeners.get("unhandledrejection")?.({
  reason: new RangeError("raw private rejection"),
  preventDefault() {
    prevented.push("unhandledrejection");
  },
});
assert.deepEqual(
  reported.map((value) => value.name),
  ["TypeError", "RangeError", "TypeError", "RangeError"],
);
assert.deepEqual(prevented, ["error", "unhandledrejection"]);

cleanup();
assert.equal(listeners.size, 0);

const main = await readFile(
  new URL("../apps/web/src/main.tsx", import.meta.url),
  "utf8",
);
const boundary = await readFile(
  new URL(
    "../apps/web/src/features/observability/web-error-boundary.tsx",
    import.meta.url,
  ),
  "utf8",
);
assert.match(main, /onCaughtError:\s*\(\)\s*=>/u);
assert.match(main, /onRecoverableError:\s*reportWebRuntimeDiagnostic/u);
assert.match(main, /onUncaughtError:\s*reportWebRuntimeDiagnostic/u);
assert.match(boundary, /role="alert"/u);
assert.match(boundary, /window\.location\.reload\(\)/u);

console.log("PASS Web observability privacy/recovery contract");
