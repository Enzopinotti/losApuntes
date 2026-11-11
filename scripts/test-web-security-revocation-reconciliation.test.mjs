import assert from "node:assert/strict";
import test from "node:test";
import { SecurityActionGate } from "../apps/web/src/features/auth/security-action-gate.ts";
import {
  isUncertainSessionRevocationError,
  isValidSessionInventory,
  sessionRevocationReconciliation,
} from "../apps/web/src/features/auth/security-session-reconciliation.mjs";

const inventory = (sessions, truncated = false) => ({
  sessions: sessions.map((id) => ({
    id,
    clientType: "web",
    current: id === "current",
    createdAt: "2026-11-11T10:00:00.000Z",
    lastSeenAt: "2026-11-11T10:30:00.000Z",
    expiresAt: "2026-11-12T10:00:00.000Z",
  })),
  truncated,
  limit: 20,
});

test("one synchronous security action per authenticated scope", () => {
  const gate = new SecurityActionGate();
  assert.equal(gate.tryAcquire("", "session:s1"), null);
  assert.equal(gate.tryAcquire("scope-a", ""), null);
  const first = gate.tryAcquire("scope-a", "session:s1");
  assert.ok(first);
  assert.equal(gate.tryAcquire("scope-a", "all-sessions"), null);
  assert.equal(gate.tryAcquire("scope-a", "password"), null);
  assert.equal(gate.tryAcquire("scope-a", "google-unlink"), null);
  assert.equal(gate.release({ ...first }), false, "forged copies cannot release");
  const second = gate.tryAcquire("scope-b", "all-sessions");
  assert.ok(second, "a new login scope must not inherit an old lock");
  assert.equal(gate.release(first), false, "old request cannot release new account");
  assert.equal(gate.tryAcquire("scope-b", "session:s2"), null);
  assert.equal(gate.release(second), true);
  assert.equal(gate.release(second), false);
  const third = gate.tryAcquire("scope-b", "session:s2");
  assert.ok(third);
  assert.ok(third.sequence > second.sequence);
  assert.equal(gate.release(third), true);
});

test("ambiguous DELETE errors require explicit revalidation, not replay", () => {
  for (const failure of [
    { code: "NETWORK_UNAVAILABLE", status: 0 },
    { code: "INVALID_RESPONSE", status: 204 },
    { name: "AbortError" },
    { name: "TimeoutError" },
    { status: 408 },
    { status: 429 },
    { status: 500 },
    { status: 503 },
  ]) {
    assert.equal(isUncertainSessionRevocationError(failure), true, JSON.stringify(failure));
  }
  for (const failure of [
    null,
    "network",
    new Error("Invalid credentials"),
    { status: 400 },
    { status: 401 },
    { status: 403 },
    { status: 404 },
    { status: 409 },
    { code: "WRONG_PASSWORD", status: 422 },
  ]) {
    assert.equal(isUncertainSessionRevocationError(failure), false, String(failure));
  }
});

test("authoritative untruncated inventory can confirm a missing remote session", () => {
  assert.equal(sessionRevocationReconciliation("other", inventory(["current"])), "revoked");
  assert.equal(sessionRevocationReconciliation("other", inventory(["current", "other"])), "active");
  assert.equal(sessionRevocationReconciliation("other", inventory(["other"], true)), "active");
  assert.equal(sessionRevocationReconciliation("other", inventory([], false)), "revoked");
});

test("absence in truncated inventory is never treated as revocation proof", () => {
  assert.equal(sessionRevocationReconciliation("other", inventory(["current"], true)), "unknown");
  assert.equal(sessionRevocationReconciliation("other", inventory([], true)), "unknown");
});

test("only valid bounded session inventories may reach the Web UI", () => {
  assert.equal(isValidSessionInventory(inventory(["session-current"])), true);
  assert.equal(isValidSessionInventory(inventory([], true)), true);
  for (const value of [
    null,
    undefined,
    { sessions: [], truncated: false },
    { sessions: [], truncated: "false", limit: 20 },
    { sessions: null, truncated: false, limit: 20 },
    { sessions: [{ id: null }], truncated: false, limit: 20 },
    { sessions: [{ id: "" }], truncated: false, limit: 20 },
    { sessions: [{ id: "partial" }], truncated: false, limit: 20 },
    {
      ...inventory(["current"]),
      sessions: [{ ...inventory(["current"]).sessions[0], current: "false" }],
    },
    {
      ...inventory(["current"]),
      sessions: [{ ...inventory(["current"]).sessions[0], expiresAt: "not-a-date" }],
    },
    { sessions: [], truncated: false, limit: 0 },
    { sessions: [], truncated: false, limit: Infinity },
  ]) {
    assert.equal(isValidSessionInventory(value), false);
  }
});

test("malformed session inventory fails closed", () => {
  for (const value of [
    null,
    undefined,
    {},
    { sessions: [], truncated: false },
    { sessions: [], truncated: "false", limit: 20 },
    { sessions: "hidden", truncated: false, limit: 20 },
    { sessions: [{ id: null }], truncated: false, limit: 20 },
    { sessions: [{ id: "" }], truncated: false, limit: 20 },
    { sessions: [{ id: "partial" }], truncated: false, limit: 20 },
    {
      ...inventory(["current"]),
      sessions: [{ ...inventory(["current"]).sessions[0], current: "false" }],
    },
    {
      ...inventory(["current"]),
      sessions: [{ ...inventory(["current"]).sessions[0], expiresAt: "not-a-date" }],
    },
    { sessions: [], truncated: false, limit: 0 },
    { sessions: [], truncated: false, limit: NaN },
  ]) {
    assert.equal(sessionRevocationReconciliation("other", value), "unknown");
  }
  assert.equal(sessionRevocationReconciliation("", inventory([])), "unknown");
});
