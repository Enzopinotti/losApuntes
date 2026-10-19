/**
 * Read-only release evidence preflight. This checks structure, source identity
 * and declarations; it does not run tests, contact providers or approve a
 * deployment. A structurally complete record is REVIEW_REQUIRED, never GO.
 */

export const CANDIDATE_REQUIRED_GATES = Object.freeze([
  "exactHeadQuality",
  "productionDependencyAudit",
  "auditExceptionContract",
  "apiRuntimeDependencyBoundary",
  "runtimeSmoke",
  "liveWebApiQualification",
  "browserHotCacheRollback",
  "publicIngressPrivacy",
  "transactionalEmail",
  "googleProviderOrDisabled",
  "secretsAndRotation",
  "backupOffHost",
  "isolatedRestoreDrill",
  "filesScanner",
  "observabilityOnCall",
  "legalPrivacySupport",
  "androidInstalledJourney",
  "iosInstalledJourney",
  "accessibilityDevices",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_REFERENCE_LENGTH = 512;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validUtcTimestamp(value) {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value;
}

function validEvidenceReference(reference) {
  if (typeof reference !== "string" ||
    reference.length < 8 ||
    reference.length > MAX_REFERENCE_LENGTH ||
    /[\r\n\t]/u.test(reference)) return false;

  try {
    const url = new URL(reference);
    return url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

/**
 * No provider secrets, evidence links, individual user names, release URLs or
 * credentials are ever copied into the result: callers can safely log codes.
 * currentSourceSha is obtained from git rev-parse HEAD by the CLI.
 */
export function evaluateCandidateEvidence({
  evidence,
  currentSourceSha,
  expectedSourceSha,
  dirtyWorktree,
  exceptionPolicy,
  auditIgnoreCves,
  nowMs,
}) {
  const blockers = new Set();
  const add = (code) => blockers.add(code);
  if (!Number.isFinite(nowMs) || nowMs < 0) add("INVALID_EVALUATION_TIME");
  const record = object(evidence) ? evidence : {};
  const expectedIsSha = SHA_PATTERN.test(expectedSourceSha ?? "");
  const actualIsSha = SHA_PATTERN.test(currentSourceSha ?? "");

  if (!expectedIsSha || !actualIsSha || expectedSourceSha !== currentSourceSha) {
    add("SOURCE_SHA_MISMATCH");
  }
  if (dirtyWorktree !== false) add("WORKTREE_NOT_CLEAN");
  if (record.schemaVersion !== 1 || record.profile !== "public") {
    add("EVIDENCE_SCHEMA_UNSUPPORTED");
  }
  if (!expectedIsSha || record.sourceSha !== expectedSourceSha) {
    add("EVIDENCE_SOURCE_SHA_MISMATCH");
  }

  const gateNames = Object.keys(object(record.gates) ? record.gates : {});
  const unknown = gateNames.filter((name) => !CANDIDATE_REQUIRED_GATES.includes(name));
  if (unknown.length) add("UNREVIEWED_GATE_NAMES");
  for (const name of CANDIDATE_REQUIRED_GATES) {
    const gate = record.gates?.[name];
    if (!object(gate) || gate.status !== "PASS") {
      add(`GATE_${name}_NOT_PASS`);
      continue;
    }
    if (!expectedIsSha || gate.sourceSha !== expectedSourceSha) {
      add(`GATE_${name}_SHA_MISMATCH`);
    }
    if (!validUtcTimestamp(gate.checkedAt) ||
      Date.parse(gate.checkedAt) > nowMs) {
      add(`GATE_${name}_TIMESTAMP_INVALID`);
    }
    if (!validEvidenceReference(gate.reference)) {
      add(`GATE_${name}_REFERENCE_INVALID`);
    }
  }

  // No scoped exceptions remain authorized. Missing audit evidence still
  // causes HOLD via the mandatory productionDependencyAudit gate above.
  // A clean exception policy alone can never certify a public release.
  if (exceptionPolicy?.version !== 1 ||
    !Array.isArray(exceptionPolicy?.exceptions) ||
    exceptionPolicy.exceptions.length !== 0 ||
    Object.keys(exceptionPolicy).sort().join(",") !== "exceptions,version") {
    add("AUDIT_EXCEPTION_POLICY_UNEXPECTED");
  }
  if (auditIgnoreCves !== undefined) {
    add("AUDIT_IGNORE_LIST_MISMATCH");
  }

  const reasonCodes = [...blockers].sort();
  return Object.freeze({
    event: "release.candidate_evidence.preflight",
    status: reasonCodes.length ? "HOLD" : "REVIEW_REQUIRED",
    candidateSha: actualIsSha ? currentSourceSha : null,
    profile: record.profile === "public" ? "public" : "unknown",
    requiredGateCount: CANDIDATE_REQUIRED_GATES.length,
    reasonCodes,
  });
}
