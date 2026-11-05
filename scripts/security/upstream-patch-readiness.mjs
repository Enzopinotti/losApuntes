/**
 * B178: independent upstream patch readiness evidence, never release approval.
 * No waiver, override, dependency mutation, CI bypass or automatic merge.
 */
export const WATCHED_ADVISORIES = Object.freeze([
  Object.freeze({
    advisoryId: "GHSA-86w9-cpqp-85rv",
    packageName: "node-forge",
    issue: 133,
  }),
  Object.freeze({
    advisoryId: "GHSA-vfj7-8cjw-p6xm",
    packageName: "braces",
    issue: 141,
  }),
]);

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/u;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function versionParts(version) {
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new TypeError("Unrecognized stable semantic version");
  }
  return version.split(".").map((part) => Number(part));
}

export function compareStableVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < 3; i++) {
    if (!Number.isSafeInteger(a[i]) || !Number.isSafeInteger(b[i])) {
      throw new TypeError("Version component out of range");
    }
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

/**
 * Only the package stanza and snapshot stanza for a watched package are
 * accepted. Missing, duplicated or mismatched versions are not a clean audit.
 */
export function installedVersion(lockfile, packageName) {
  if (typeof lockfile !== "string" ||
      !lockfile.startsWith("lockfileVersion: '9.0'\n") ||
      !["node-forge", "braces"].includes(packageName)) {
    throw new TypeError("Unrecognized lockfile or monitored package");
  }
  const sections = lockfile.split(/\r?\nsnapshots:\r?\n/u);
  if (sections.length !== 2) throw new Error("pnpm snapshots missing or duplicated");
  const versions = sections.map((section) =>
    section.split(/\r?\n/u).flatMap((line) => {
      const match = line.match(/^  ([a-z-]+)@([0-9]+\.[0-9]+\.[0-9]+):(?:\s*.*)?$/u);
      return match?.[1] === packageName ? [match[2]] : [];
    }),
  );
  if (versions[0].length !== 1 || versions[1].length !== 1 ||
      versions[0][0] !== versions[1][0]) {
    throw new Error(packageName + " package/snapshot graph is ambiguous");
  }
  versionParts(versions[0][0]);
  return versions[0][0];
}

function patchIdentifier(value) {
  if (value === null) return null;
  if (!object(value) || typeof value.identifier !== "string") {
    throw new TypeError("Unrecognized upstream patch version structure");
  }
  versionParts(value.identifier);
  return value.identifier;
}

export function classifyUpstreamReadiness({ spec, lockedVersion, advisory, latest, patched }) {
  if (!object(spec) || !WATCHED_ADVISORIES.some(
    (item) => item.packageName === spec.packageName &&
      item.advisoryId === spec.advisoryId && item.issue === spec.issue,
  )) throw new TypeError("Unknown monitored advisory");

  versionParts(lockedVersion);
  if (!object(advisory) || advisory.ghsa_id !== spec.advisoryId ||
      !["high", "critical"].includes(advisory.severity)) {
    throw new Error("Advisory identity/severity changed; security review required");
  }
  if (!Array.isArray(advisory.vulnerabilities)) {
    throw new Error("Upstream advisory vulnerabilities missing");
  }
  const matches = advisory.vulnerabilities.filter((v) =>
    object(v) && object(v.package) &&
    v.package.ecosystem === "npm" && v.package.name === spec.packageName,
  );
  if (matches.length !== 1 || typeof matches[0].vulnerable_version_range !== "string" ||
      !matches[0].vulnerable_version_range.trim()) {
    throw new Error("Incomplete or ambiguous vulnerable package scope");
  }
  if (!object(latest) || typeof latest.version !== "string" ||
      latest.name !== spec.packageName) {
    throw new Error("Official npm latest metadata identity invalid");
  }
  const latestVersion = latest.version;
  versionParts(latestVersion);
  const firstPatched = patchIdentifier(matches[0].first_patched_version);
  const common = {
    advisory: spec.advisoryId,
    package: spec.packageName,
    issue: spec.issue,
    lockedVersion,
    latestPublishedVersion: latestVersion,
    firstPatchedVersion: firstPatched,
    advisoryWithdrawn: advisory.withdrawn_at != null,
    releaseAuthorized: false,
    productionAuditCertified: false,
    allowedToOverrideAudit: false,
  };
  if (advisory.withdrawn_at != null) {
    return { ...common, status: "UPSTREAM_REVIEW_REQUIRED",
      reason: "ADVISORY_WITHDRAWN_REQUIRES_INDEPENDENT_REVIEW" };
  }
  if (firstPatched === null) {
    if (patched != null) {
      throw new Error("Unexpected npm patch metadata with no advisory patch");
    }
    return compareStableVersions(latestVersion, lockedVersion) > 0
      ? { ...common, status: "UPSTREAM_REVIEW_REQUIRED",
        reason: "NEWER_VERSION_WITHOUT_SECURITY_ATTESTATION" }
      : { ...common, status: "NO_VERIFIED_PATCH", reason: "ADVISORY_HAS_NO_PATCH" };
  }

  if (!object(patched) || patched.name !== spec.packageName ||
      patched.version !== firstPatched || !object(patched.dist)) {
    throw new Error("GitHub patched version is not verified on npm");
  }
  if (!INTEGRITY.test(patched.dist.integrity) ||
      patched.dist.tarball !==
      "https://registry.npmjs.org/" + spec.packageName + "/-/" +
      spec.packageName + "-" + firstPatched + ".tgz") {
    throw new Error("Patched tarball integrity or origin not verified");
  }
  if (compareStableVersions(firstPatched, lockedVersion) <= 0) {
    return { ...common, status: "UPSTREAM_REVIEW_REQUIRED",
      reason: "LOCK_VERSION_REQUIRES_ADVISORY_RECONCILIATION" };
  }
  return {
    ...common,
    status: "PATCH_PUBLISHED_REQUIRES_REMEDIATION",
    reason: "VERIFIED_NPM_TARBALL_AND_GITHUB_PATCH",
    patchedTarballIntegrity: patched.dist.integrity,
  };
}

export function summarizeUpstreamReadiness(items) {
  if (!Array.isArray(items) || items.length !== WATCHED_ADVISORIES.length ||
      items.some((x) => !object(x))) {
    throw new TypeError("Incomplete security watch evidence");
  }
  for (const spec of WATCHED_ADVISORIES) {
    if (items.filter(x => x.advisory === spec.advisoryId &&
        x.package === spec.packageName).length !== 1) {
      throw new Error("Missing or duplicated advisory evidence");
    }
  }
  const statuses = new Set(items.map((x) => x.status));
  const status = statuses.has("UPSTREAM_REVIEW_REQUIRED")
    ? "MANUAL_SECURITY_REVIEW_REQUIRED"
    : statuses.has("PATCH_PUBLISHED_REQUIRES_REMEDIATION")
      ? "PATCH_ACTION_REQUIRED"
      : statuses.size === 1 && statuses.has("NO_VERIFIED_PATCH")
        ? "HOLD_UPSTREAM"
        : "INVALID_EVIDENCE";
  return {
    event: "security.upstream_patch_readiness",
    status,
    packages: items,
    releaseAuthorized: false,
    productionAuditCertified: false,
    allowedToOverrideAudit: false,
  };
}
