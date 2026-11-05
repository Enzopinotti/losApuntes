import { readFile } from "node:fs/promises";
import {
  WATCHED_ADVISORIES,
  classifyUpstreamReadiness,
  installedVersion,
  summarizeUpstreamReadiness,
  versionParts,
} from "./upstream-patch-readiness.mjs";

const BYTE_LIMIT = 256 * 1024;
const FETCH_TIMEOUT_MS = 12000;

/** Bounded official-source GET. Never follow redirects to third-party hosts. */
async function getOfficialJSON(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" ||
      !["api.github.com", "registry.npmjs.org"].includes(parsed.hostname) ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Unapproved upstream metadata source");
  }
  const response = await fetch(url, {
    headers: {
      Accept: parsed.hostname === "api.github.com"
        ? "application/vnd.github+json"
        : "application/json",
      "User-Agent": "losApuntes-b178-security-patch-observer",
    },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new Error("Upstream metadata unavailable: " + parsed.hostname +
      " status " + response.status);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > BYTE_LIMIT) {
      await response.body.cancel().catch(() => {});
      throw new Error("Upstream metadata response exceeded byte limit");
    }
    chunks.push(chunk);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
}

async function inspectOne(spec, lockfile) {
  const lockedVersion = installedVersion(lockfile, spec.packageName);
  const advisory = await getOfficialJSON(
    "https://api.github.com/advisories/" + spec.advisoryId,
  );
  const latest = await getOfficialJSON(
    "https://registry.npmjs.org/" + spec.packageName + "/latest",
  );
  const match = Array.isArray(advisory.vulnerabilities)
    ? advisory.vulnerabilities.find((v) =>
      v?.package?.ecosystem === "npm" &&
      v.package.name === spec.packageName)
    : null;
  const claimedPatch = match?.first_patched_version?.identifier;
  let patched = null;
  if (claimedPatch != null) {
    versionParts(claimedPatch);
    patched = await getOfficialJSON(
      "https://registry.npmjs.org/" + spec.packageName + "/" + claimedPatch,
    );
  }
  return classifyUpstreamReadiness({
    spec,
    lockedVersion,
    advisory,
    latest,
    patched,
  });
}

async function main() {
  if (process.argv.length !== 2) throw new Error("No CLI arguments accepted");
  const lock = await readFile("pnpm-lock.yaml", "utf8");
  const results = [];
  for (const spec of WATCHED_ADVISORIES) {
    results.push(await inspectOne(spec, lock));
  }
  const evidence = summarizeUpstreamReadiness(results);
  console.log(JSON.stringify(evidence));
  if (evidence.status !== "HOLD_UPSTREAM") {
    // Patch available or changed metadata is urgent security work,
    // never permission to publish. The unchanged prod audit still gates.
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    event: "security.upstream_patch_readiness",
    status: "INVALID_EVIDENCE",
    reason: error instanceof Error ? error.message : "unknown",
    releaseAuthorized: false,
    productionAuditCertified: false,
    allowedToOverrideAudit: false,
  }));
  process.exitCode = 2;
}
