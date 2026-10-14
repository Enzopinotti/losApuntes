import { execFileSync } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateCandidateEvidence } from "./candidate-evidence-lib.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const MAX_EVIDENCE_BYTES = 128 * 1024;

function emitHold(reasonCode) {
  console.log(JSON.stringify({
    event: "release.candidate_evidence.preflight",
    status: "HOLD",
    reasonCodes: [reasonCode],
  }));
  process.exitCode = 2;
}

function isWithin(parent, file) {
  const relative = path.relative(parent, file);
  return relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative));
}

function git(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 512 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Purely local, read-only and fail-closed:
 * - no network requests / CI / build / Docker / deployment;
 * - no file writes, no secret printing;
 * - records outside the repository, not committed into Git.
 */
async function main() {
  const inputPath = process.env.RELEASE_CANDIDATE_EVIDENCE_FILE;
  const expectedSourceSha = process.env.RELEASE_EXPECTED_SOURCE_SHA;
  if (!inputPath || !path.isAbsolute(inputPath)) {
    emitHold("EXTERNAL_EVIDENCE_FILE_REQUIRED");
    return;
  }
  if (!expectedSourceSha) {
    emitHold("EXPECTED_SOURCE_SHA_REQUIRED");
    return;
  }

  let evidenceFile;
  let actualRoot;
  let fileInfo;
  try {
    [evidenceFile, actualRoot] = await Promise.all([
      realpath(inputPath),
      realpath(repoRoot),
    ]);
    if (isWithin(actualRoot, evidenceFile)) {
      emitHold("EVIDENCE_FILE_MUST_BE_OUTSIDE_REPOSITORY");
      return;
    }
    fileInfo = await stat(evidenceFile);
    if (!fileInfo.isFile() || fileInfo.size > MAX_EVIDENCE_BYTES) {
      emitHold("EVIDENCE_FILE_INVALID");
      return;
    }
  } catch {
    emitHold("EVIDENCE_FILE_UNAVAILABLE");
    return;
  }

  let evidence;
  let policy;
  let rootManifest;
  let sourceSha;
  let dirtyWorktree;
  try {
    const [evidenceText, policyText, manifestText] = await Promise.all([
      readFile(evidenceFile, "utf8"),
      readFile(new URL("../../security/audit-exceptions.json", import.meta.url), "utf8"),
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ]);
    evidence = JSON.parse(evidenceText);
    policy = JSON.parse(policyText);
    rootManifest = JSON.parse(manifestText);
    sourceSha = git(["rev-parse", "HEAD"]);
    dirtyWorktree = git(["status", "--porcelain", "--untracked-files=all"]) !== "";
  } catch {
    emitHold("EVIDENCE_OR_GIT_UNREADABLE");
    return;
  }

  const result = evaluateCandidateEvidence({
    evidence,
    currentSourceSha: sourceSha,
    expectedSourceSha,
    dirtyWorktree,
    exceptionPolicy: policy,
    auditIgnoreCves: rootManifest?.pnpm?.auditConfig?.ignoreCves,
    nowMs: Date.now(),
  });
  console.log(JSON.stringify(result));
  if (result.status === "HOLD") process.exitCode = 2;
  // A 0 exit means only "reviewable record", not security or release GO.
}

void main().catch(() => emitHold("PREFLIGHT_UNEXPECTED_ERROR"));
