import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANDIDATE_REQUIRED_GATES,
  evaluateCandidateEvidence,
} from "./candidate-evidence-lib.mjs";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const WELL_BEFORE_EXPIRY = Date.parse("2026-10-12T00:00:00.000Z");

const reviewedPolicy = { version: 1, exceptions: [] };

function fullEvidence() {
  return {
    schemaVersion: 1,
    sourceSha: SHA,
    profile: "public",
    gates: Object.fromEntries(CANDIDATE_REQUIRED_GATES.map((name) => [
      name, {
        status: "PASS",
        sourceSha: SHA,
        checkedAt: "2026-10-12T00:00:00.000Z",
        reference: `https://evidence.example.invalid/reviews/${name}`,
      },
    ])),
  };
}

function assess(overrides = {}) {
  return evaluateCandidateEvidence({
    evidence: fullEvidence(),
    currentSourceSha: SHA,
    expectedSourceSha: SHA,
    dirtyWorktree: false,
    exceptionPolicy: reviewedPolicy,
    auditIgnoreCves: undefined,
    nowMs: WELL_BEFORE_EXPIRY,
    ...overrides,
  });
}

test("a complete same-SHA attestation is only REVIEW_REQUIRED, never GO or PASS", () => {
  const result = assess();
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.candidateSha, SHA);
  assert.equal(result.requiredGateCount, CANDIDATE_REQUIRED_GATES.length);
  assert.deepEqual(result.reasonCodes, []);
  assert.doesNotMatch(JSON.stringify(result), /evidence\.example|provider|secret=/iu);
});

test("requires all named gates; missing or failed status always HOLDS", () => {
  const evidence = fullEvidence();
  delete evidence.gates.backupOffHost;
  evidence.gates.productionDependencyAudit.status = "PENDING";
  const result = assess({ evidence });
  assert.equal(result.status, "HOLD");
  assert.ok(result.reasonCodes.includes("GATE_backupOffHost_NOT_PASS"));
  assert.ok(result.reasonCodes.includes("GATE_productionDependencyAudit_NOT_PASS"));
  assert.equal(result.reasonCodes.length, 2);
});

test("does not silently accept unknown gates or unsupported profiles", () => {
  const evidence = fullEvidence();
  evidence.profile = "internal_qa";
  evidence.gates.fabricatedSuccess = {
    status: "PASS", sourceSha: SHA,
    checkedAt: "2026-10-12T00:00:00.000Z",
    reference: "https://evidence.example.invalid/extra",
  };
  const result = assess({ evidence });
  assert.equal(result.status, "HOLD");
  assert.ok(result.reasonCodes.includes("EVIDENCE_SCHEMA_UNSUPPORTED"));
  assert.ok(result.reasonCodes.includes("UNREVIEWED_GATE_NAMES"));
});

test("rejects wrong HEAD, expected SHA, record SHA and dirty worktree independently", () => {
  assert.ok(assess({ currentSourceSha: OTHER_SHA }).reasonCodes.includes("SOURCE_SHA_MISMATCH"));
  assert.ok(assess({ expectedSourceSha: OTHER_SHA }).reasonCodes.includes("SOURCE_SHA_MISMATCH"));
  assert.ok(assess({ dirtyWorktree: true }).reasonCodes.includes("WORKTREE_NOT_CLEAN"));
  const evidence = fullEvidence();
  evidence.sourceSha = OTHER_SHA;
  assert.ok(assess({ evidence }).reasonCodes.includes("EVIDENCE_SOURCE_SHA_MISMATCH"));
});

test("checks the same exact Git SHA on every gate, not only the header", () => {
  const evidence = fullEvidence();
  evidence.gates.iosInstalledJourney.sourceSha = OTHER_SHA;
  const result = assess({ evidence });
  assert.equal(result.status, "HOLD");
  assert.ok(result.reasonCodes.includes("GATE_iosInstalledJourney_SHA_MISMATCH"));
});

test("rejects malformed, future and fake dates rather than normalizing them", () => {
  const badDates = [
    "2026-02-30T00:00:00.000Z",
    "2026-10-12",
    "2026-10-12T00:00:00+00:00",
    "2026-10-12T00:00:00.000+00:00",
    "not-a-date",
    "2026-10-12T00:00:00.000Z\nsecret",
    "2026-10-20T00:00:00.000Z",
  ];
  for (const bad of badDates) {
    const evidence = fullEvidence();
    evidence.gates.runtimeSmoke.checkedAt = bad;
    const result = assess({ evidence });
    assert.ok(
      result.reasonCodes.includes("GATE_runtimeSmoke_TIMESTAMP_INVALID"),
      bad,
    );
  }
  assert.ok(assess({ nowMs: Number.NaN }).reasonCodes.includes("INVALID_EVALUATION_TIME"));
});

test("rejects references with tokens, auth info, non-HTTPS or control characters", () => {
  for (const bad of [
    "http://host.example/qa",
    "https://user:password@evidence.example.invalid/run",
    "https://evidence.example.invalid/run?token=secret",
    "https://evidence.example.invalid/run#credential",
    "file:///tmp/private/qa",
    "https://evidence.example.invalid/run\nsecret",
    "s3://bucket/private",
    "",
  ]) {
    const evidence = fullEvidence();
    evidence.gates.transactionalEmail.reference = bad;
    const result = assess({ evidence });
    assert.ok(result.reasonCodes.includes("GATE_transactionalEmail_REFERENCE_INVALID"), bad);
    assert.doesNotMatch(JSON.stringify(result), /password|credential|private\/qa/iu);
  }
});

test("retired exception policy never becomes authorized by extending its expiry", () => {
  for (const expiresAt of [
    "2026-10-15T00:00:00.000Z",
    "2027-10-15T00:00:00.000Z",
  ]) {
    const legacy = {
      version: 1,
      exceptions: [{
        cve: "CVE-2026-85393",
        ghsa: "GHSA-86w9-cpqp-85rv",
        package: "node-forge",
        version: "1.4.0",
        expiresAt,
      }],
    };
    const result = assess({ exceptionPolicy: legacy });
    assert.equal(result.status, "HOLD");
    assert.ok(result.reasonCodes.includes("AUDIT_EXCEPTION_POLICY_UNEXPECTED"));
  }
});

test("any non-empty or malformed ignore policy forces release HOLD", () => {
  for (const auditIgnoreCves of [
    [],
    ["CVE-2026-85393"],
    ["CVE-2026-93687"],
    ["CVE-2026-85393", "CVE-2026-93687"],
  ]) {
    const result = assess({ auditIgnoreCves });
    assert.ok(result.reasonCodes.includes("AUDIT_IGNORE_LIST_MISMATCH"));
  }
  for (const exceptionPolicy of [
    { version: 2, exceptions: [] },
    { version: 1, exceptions: [], extra: true },
    { version: 1, exceptions: ["unreviewed"] },
  ]) {
    assert.ok(assess({ exceptionPolicy }).reasonCodes.includes(
      "AUDIT_EXCEPTION_POLICY_UNEXPECTED",
    ));
  }
});

test("clean waiver configuration never masks a missing production dependency audit", () => {
  const evidence = fullEvidence();
  delete evidence.gates.productionDependencyAudit;
  const result = assess({ evidence });
  assert.equal(result.status, "HOLD");
  assert.ok(result.reasonCodes.includes("GATE_productionDependencyAudit_NOT_PASS"));
});

test("an empty or malformed evidence document cannot be interpreted as success", () => {
  for (const evidence of [null, {}, [], "PASS", { gates: "PASS" }]) {
    assert.equal(assess({ evidence }).status, "HOLD");
  }
});

test("CLI remains read-only and requires evidence outside repository", () => {
  const cli = readFileSync(new URL("./check-candidate-evidence.mjs", import.meta.url), "utf8");
  assert.match(cli, /RELEASE_CANDIDATE_EVIDENCE_FILE/u);
  assert.match(cli, /RELEASE_EXPECTED_SOURCE_SHA/u);
  assert.match(cli, /EVIDENCE_FILE_MUST_BE_OUTSIDE_REPOSITORY/u);
  assert.match(cli, /--porcelain/u);
  assert.match(cli, /git\(\["rev-parse", "HEAD"\]\)/u);
  assert.match(cli, /MAX_EVIDENCE_BYTES = 128 \* 1024/u);
  assert.doesNotMatch(cli, /\bfetch\s*\(|docker compose|mongorestore|writeFile\(/iu);
});
