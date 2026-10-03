import assert from "node:assert/strict";

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

assert.equal(
  normalizeWebDiagnosticSurface("/login"),
  "/login",
);
assert.equal(
  normalizeWebDiagnosticSurface("/dashboard"),
  "/dashboard",
);
assert.equal(
  normalizeWebDiagnosticSurface("/notifications"),
  "/notifications",
);
assert.equal(
  normalizeWebDiagnosticSurface("/organizations/org-secret/manage"),
  "/organizations/:id/manage",
);
assert.equal(
  normalizeWebDiagnosticSurface("/p/private-profile-id"),
  "/p/:id",
);

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
assert.deepEqual(
  reported.map((value) => value.name),
  ["TypeError", "RangeError"],
);

cleanup();
assert.equal(listeners.size, 0);

console.log("PASS Web observability privacy/recovery contract");
