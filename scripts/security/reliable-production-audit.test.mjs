import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUDIT_ARGS,
  ATTEMPT_TIMEOUT_MS,
  MAX_ATTEMPTS,
  OUTPUT_LIMIT,
  classifyAuditAttempt,
  runProductionAudit,
} from "./reliable-production-audit.mjs";

const audit = (output, exitCode = 1, extra = {}) => ({
  output, exitCode, signal: null, timedOut: false,
  spawnError: false, exceeded: false, ...extra,
});
const clean = audit("No known vulnerabilities found", 0);
const vulnerable = audit("5 vulnerabilities found\nSeverity: 3 moderate | 2 high\nGHSA-vfj7-8cjw-p6xm");

function harness(responses, options = {}) {
  const events = [];
  const calls = [];
  const sleeps = [];
  let digest = "sha256:original-lock";
  return {
    events, calls, sleeps,
    drift: () => { digest = "sha256:changed-lock"; },
    run: () => runProductionAudit({
      execute: async () => {
        calls.push(AUDIT_ARGS.join(" "));
        if (options.driftOnAttempt === calls.length) digest = "sha256:changed-lock";
        return responses[calls.length - 1];
      },
      sleep: async ms => { sleeps.push(ms); },
      fingerprint: async () => digest,
      emit: event => events.push(event),
    }),
  };
}

test("Audit01 canonical HIGH audit cannot be quietly changed to JSON-only or low", () => {
  assert.deepEqual(AUDIT_ARGS, ["audit", "--prod", "--audit-level", "high"]);
  assert.equal(Object.isFrozen(AUDIT_ARGS), true);
  assert.equal(MAX_ATTEMPTS, 2);
  assert.ok(ATTEMPT_TIMEOUT_MS <= 120000);
  assert.ok(OUTPUT_LIMIT <= 1024 * 1024);
});

test("Audit01 explicit green CLI report is only a scanner result, never release approval", async () => {
  const h = harness([clean]);
  assert.deepEqual(await h.run(), {
    status: "SCANNER_CLEAN_REQUIRES_OTHER_GATES", exitCode: 0,
  });
  assert.equal(h.calls.length, 1);
  assert.equal(h.sleeps.length, 0);
  assert.deepEqual(h.events.map(x => x.authorized), [false]);
});

test("Audit01 HIGH GHSA output fails on first attempt without retry", async () => {
  const h = harness([vulnerable, clean]);
  assert.deepEqual(await h.run(), {
    status: "VULNERABILITIES_FOUND", exitCode: 1,
  });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.sleeps, []);
});

test("Audit01 npm ERR_SOCKET_TIMEOUT retries once then fails closed if provider still down", async () => {
  const h = harness([
    audit("ERR_SOCKET_TIMEOUT request to https://registry.npmjs.org/-/npm/v1/security/audits failed"),
    audit("ERR_SOCKET_TIMEOUT request failed"),
  ]);
  assert.deepEqual(await h.run(), { status: "PROVIDER_UNAVAILABLE", exitCode: 2 });
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.sleeps, [3000]);
  assert.deepEqual(h.events.map(x => x.status),
    ["PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"]);
});

test("Audit01 second attempt with real HIGH stays red, even after a transient outage", async () => {
  const h = harness([
    audit("ECONNRESET on registry.npmjs.org"),
    vulnerable,
  ]);
  assert.deepEqual(await h.run(), { status: "VULNERABILITIES_FOUND", exitCode: 1 });
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.sleeps, [3000]);
});

test("Audit01 second attempt with authoritative clean report is scanner-only green", async () => {
  const h = harness([audit("EAI_AGAIN npm audit"), clean]);
  assert.deepEqual(await h.run(),
    { status: "SCANNER_CLEAN_REQUIRES_OTHER_GATES", exitCode: 0 });
  assert.equal(h.calls.length, 2);
});

test("Audit01 nonzero unknown error is never accepted or blindly retried", async () => {
  const h = harness([audit("unexpected package integrity failure"), clean]);
  assert.deepEqual(await h.run(), { status: "INVALID_EVIDENCE", exitCode: 2 });
  assert.equal(h.calls.length, 1);
});

test("Audit01 missing clean attestation or conflicting high evidence fails closed", () => {
  assert.equal(classifyAuditAttempt(audit("", 0)), "INVALID_EVIDENCE");
  assert.equal(classifyAuditAttempt(audit("No known vulnerabilities found\n5 vulnerabilities found", 0)),
    "INVALID_EVIDENCE");
  assert.equal(classifyAuditAttempt(audit("No known vulnerabilities found\nETIMEDOUT", 0)),
    "INVALID_EVIDENCE");
  assert.equal(classifyAuditAttempt(audit("random", 1)), "INVALID_EVIDENCE");
});

test("Audit01 signal, timeout, cap or spawn failure cannot be treated as valid", () => {
  for (const malformed of [
    { timedOut: true },
    { exceeded: true },
    { spawnError: true },
    { signal: "SIGTERM" },
  ]) {
    assert.equal(classifyAuditAttempt(audit("No known vulnerabilities found", 0, malformed)),
      "INVALID_EVIDENCE");
  }
});

test("Audit01 lockfile or policy mutation during scanner always blocks release", async () => {
  const h = harness([clean], { driftOnAttempt: 1 });
  assert.deepEqual(await h.run(), { status: "SOURCE_DRIFT", exitCode: 2 });
  assert.equal(h.events[0].authorized, false);
});

test("Audit01 rejects extra attempts and untrusted runner implementation", async () => {
  await assert.rejects(() => runProductionAudit({ execute: async () => clean,
    fingerprint: async () => "x", emit: () => {}, sleep: async () => {},
    maxAttempts: 999,
  }));
});

test("Audit01 actual workflow preserves exception checks and exact-HEAD identity", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const source = await readFile("scripts/security/enforce-reliable-production-audit.mjs", "utf8");
  const packageJSON = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJSON.scripts["audit:prod"], "pnpm audit --prod --audit-level high");
  assert.match(workflow, /pnpm security:audit-exceptions/u);
  assert.match(workflow, /node scripts\/security\/enforce-reliable-production-audit\.mjs/u);
  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/u);
  assert.match(source, /fileDigest\("pnpm-lock.yaml"\)/u);
  assert.match(source, /fileDigest\("security\/audit-exceptions.json"\)/u);
  assert.doesNotMatch(source, /audit-level low|ignoreAdvisory|auditConfig|pnpm add|pnpm install|git push/u);
});

test("Audit01 every structured observation is explicitly non-authorizing", async () => {
  const h = harness([vulnerable]);
  await h.run();
  assert.equal(h.events.length, 1);
  assert.ok(h.events.every(x => x.authorized === false));
});
