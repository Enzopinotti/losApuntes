import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const AUDIT_ARGS = Object.freeze(["audit", "--prod", "--audit-level", "high"]);
export const MAX_ATTEMPTS = 2;
export const OUTPUT_LIMIT = 1024 * 1024;
export const ATTEMPT_TIMEOUT_MS = 95_000;

const NETWORK_FAILURE = /\b(?:ERR_SOCKET_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_AUDIT_BAD_RESPONSE)\b|(?:fetch|request|socket)\s+timeout/iu;
const VERIFIED_CLEAN = /(?:No known vulnerabilities found|found 0 vulnerabilities|0 vulnerabilities found)/iu;
const ADVISORY_REPORT = /\b(?:\d+\s+vulnerabilit(?:y|ies)\s+found|Severity:\s*[\d\s\w|]+high|GHSA-[a-z0-9-]+)\b/iu;

export function classifyAuditAttempt(attempt) {
  if (!attempt || typeof attempt !== "object" ||
      typeof attempt.output !== "string" ||
      !Number.isSafeInteger(attempt.exitCode) && attempt.exitCode !== null) {
    return "INVALID_EVIDENCE";
  }
  if (attempt.timedOut || attempt.exceeded || attempt.spawnError ||
      attempt.signal) return "INVALID_EVIDENCE";
  if (attempt.exitCode === 0) {
    return VERIFIED_CLEAN.test(attempt.output) && !NETWORK_FAILURE.test(attempt.output) &&
      !ADVISORY_REPORT.test(attempt.output)
      ? "SCANNER_CLEAN_REQUIRES_OTHER_GATES"
      : "INVALID_EVIDENCE";
  }
  if (ADVISORY_REPORT.test(attempt.output)) return "VULNERABILITIES_FOUND";
  if (NETWORK_FAILURE.test(attempt.output)) return "PROVIDER_UNAVAILABLE";
  return "INVALID_EVIDENCE";
}

export async function fileDigest(file) {
  const content = await readFile(file);
  return createHash("sha256").update(content).digest("hex");
}

export async function runProductionAudit({
  execute,
  sleep,
  fingerprint,
  emit,
  maxAttempts = MAX_ATTEMPTS,
}) {
  if (typeof execute !== "function" || typeof sleep !== "function" ||
      typeof fingerprint !== "function" || typeof emit !== "function" ||
      maxAttempts !== MAX_ATTEMPTS) {
    throw new TypeError("Invalid mandatory audit runner configuration");
  }
  const base = await fingerprint();
  let last = null;
  for (let count = 1; count <= maxAttempts; count++) {
    const result = await execute();
    const after = await fingerprint();
    if (after !== base) {
      emit({ event: "security.audit.reliable", status: "SOURCE_DRIFT",
        attempt: count, authorized: false });
      return { status: "SOURCE_DRIFT", exitCode: 2 };
    }
    const status = classifyAuditAttempt(result);
    last = { status, attempt: count };
    emit({ event: "security.audit.reliable", status, attempt: count,
      maxAttempts, authorized: false });
    if (status === "SCANNER_CLEAN_REQUIRES_OTHER_GATES") {
      return { status, exitCode: 0 };
    }
    if (status !== "PROVIDER_UNAVAILABLE" || count === maxAttempts) {
      return { status, exitCode: status === "VULNERABILITIES_FOUND" ? 1 : 2 };
    }
    await sleep(3000);
  }
  return { status: last?.status ?? "INVALID_EVIDENCE", exitCode: 2 };
}

export async function executePnpmAudit() {
  return await new Promise((resolve) => {
    const child = spawn("pnpm", AUDIT_ARGS, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, CI: "true" },
    });
    const buffers = [];
    let total = 0;
    let exceeded = false;
    let timedOut = false;
    let spawnError = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, ATTEMPT_TIMEOUT_MS);

    function collect(chunk) {
      total += chunk.length;
      if (total > OUTPUT_LIMIT) {
        exceeded = true;
        child.kill("SIGKILL");
        return;
      }
      buffers.push(chunk);
    }
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", () => { spawnError = true; });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = Buffer.concat(buffers).toString("utf8");
      resolve({
        exitCode: code, signal, timedOut, spawnError, exceeded, output,
      });
    });
  });
}
