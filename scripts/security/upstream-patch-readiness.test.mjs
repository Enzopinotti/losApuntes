import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  WATCHED_ADVISORIES,
  classifyUpstreamReadiness,
  compareStableVersions,
  installedVersion,
  summarizeUpstreamReadiness,
} from "./upstream-patch-readiness.mjs";

const forge = WATCHED_ADVISORIES[0];
const braces = WATCHED_ADVISORIES[1];
const integrity = "sha512-" + "A".repeat(86) + "==";

function makeAdvisory(spec, patchedVersion = null) {
  return {
    ghsa_id: spec.advisoryId,
    severity: "high",
    withdrawn_at: null,
    vulnerabilities: [{
      package: { ecosystem: "npm", name: spec.packageName },
      vulnerable_version_range: "<= 1.4.0",
      first_patched_version: patchedVersion
        ? { identifier: patchedVersion } : null,
    }],
  };
}

function observe(spec, opts = {}) {
  const lockedVersion = opts.lockedVersion ??
    (spec.packageName === "braces" ? "3.0.3" : "1.4.0");
  const latestVersion = opts.latestVersion ?? lockedVersion;
  const patch = opts.patch ?? null;
  const advisory = opts.advisory ?? makeAdvisory(spec, patch);
  return classifyUpstreamReadiness({
    spec, lockedVersion,
    advisory,
    latest: opts.latest ?? { name: spec.packageName, version: latestVersion },
    patched: opts.patched === undefined ? (patch ? {
      name: spec.packageName,
      version: patch,
      dist: {
        integrity,
        tarball: "https://registry.npmjs.org/" + spec.packageName +
          "/-/" + spec.packageName + "-" + patch + ".tgz",
      },
    } : null) : opts.patched,
  });
}

test("B178 current upstream state is HOLD, never release authorization", () => {
  const result = summarizeUpstreamReadiness([observe(forge), observe(braces)]);
  assert.equal(result.status, "HOLD_UPSTREAM");
  for (const p of result.packages) {
    assert.equal(p.status, "NO_VERIFIED_PATCH");
    assert.equal(p.releaseAuthorized, false);
    assert.equal(p.productionAuditCertified, false);
    assert.equal(p.allowedToOverrideAudit, false);
  }
  assert.equal(result.releaseAuthorized, false);
});

test("B178 signed/published patch is actionable but cannot authorize release", () => {
  const first = observe(forge, { patch: "1.4.1", latestVersion: "1.4.1" });
  const second = observe(braces);
  assert.equal(first.status, "PATCH_PUBLISHED_REQUIRES_REMEDIATION");
  assert.equal(first.patchedTarballIntegrity, integrity);
  const summary = summarizeUpstreamReadiness([first, second]);
  assert.equal(summary.status, "PATCH_ACTION_REQUIRED");
  assert.equal(summary.productionAuditCertified, false);
  assert.equal(summary.allowedToOverrideAudit, false);
});

test("B178 a newer npm release without GHSA patch declaration needs manual review", () => {
  const result = observe(braces, { latestVersion: "3.0.4" });
  assert.equal(result.status, "UPSTREAM_REVIEW_REQUIRED");
  assert.equal(result.reason, "NEWER_VERSION_WITHOUT_SECURITY_ATTESTATION");
});

test("B178 advisory withdrawal requires review rather than a silent pass", () => {
  const advisory = makeAdvisory(forge);
  advisory.withdrawn_at = "2026-10-21T00:00:00Z";
  assert.equal(observe(forge, { advisory }).status, "UPSTREAM_REVIEW_REQUIRED");
});

test("B178 changed GHSA identity, severity and package scope fail closed", () => {
  for (const mutate of [
    x => { x.ghsa_id = "GHSA-fake"; },
    x => { x.severity = "moderate"; },
    x => { x.vulnerabilities = []; },
    x => { x.vulnerabilities[0].package.name = "other"; },
    x => { x.vulnerabilities[0].package.ecosystem = "maven"; },
    x => { x.vulnerabilities[0].vulnerable_version_range = ""; },
    x => { x.vulnerabilities.push(x.vulnerabilities[0]); },
    x => { delete x.vulnerabilities; },
    x => { delete x.vulnerabilities[0].first_patched_version; },
  ]) {
    const adv = makeAdvisory(forge);
    mutate(adv);
    assert.throws(() => observe(forge, { advisory: adv }));
  }
});

test("B178 npm patch tampering, unpublished version, wrong host and checksum fail", () => {
  const version = "1.4.1";
  const basic = observe(forge, { patch: version });
  assert.equal(basic.status, "PATCH_PUBLISHED_REQUIRES_REMEDIATION");
  for (const broken of [
    { name: "node-forge", version: "1.4.0", dist: { integrity,
      tarball: "https://registry.npmjs.org/node-forge/-/node-forge-1.4.1.tgz" } },
    { name: "not-node-forge", version, dist: { integrity,
      tarball: "https://registry.npmjs.org/node-forge/-/node-forge-1.4.1.tgz" } },
    { name: "node-forge", version, dist: { integrity: "sha512-invalid",
      tarball: "https://registry.npmjs.org/node-forge/-/node-forge-1.4.1.tgz" } },
    { name: "node-forge", version, dist: { integrity,
      tarball: "https://attacker.invalid/node-forge.tgz" } },
    null,
  ]) {
    assert.throws(() => observe(forge, { patch: version, patched: broken }));
  }
});

test("B178 patch equal to or below pinned installed version never appears safe", () => {
  assert.equal(observe(forge, { patch: "1.4.0" }).status,
    "UPSTREAM_REVIEW_REQUIRED");
  assert.equal(observe(forge, { patch: "1.3.9" }).status,
    "UPSTREAM_REVIEW_REQUIRED");
});

test("B178 malformed, prerelease and overflowing semver input is rejected", () => {
  for (const bad of ["1.4", "v1.4.1", "1.4.1-rc.1", "01.4.0",
    "-1.4.0", "999999999999999999999999999999.0.0", "", null]) {
    assert.throws(() => compareStableVersions(bad, "1.4.0"));
  }
  assert.equal(compareStableVersions("1.4.1", "1.4.0"), 1);
  assert.equal(compareStableVersions("3.0.3", "3.0.3"), 0);
  assert.equal(compareStableVersions("1.4.0", "1.4.1"), -1);
});

test("B178 summaries reject partial, duplicate or unknown GHSA findings", () => {
  const a = observe(forge);
  const b = observe(braces);
  assert.throws(() => summarizeUpstreamReadiness([a]));
  assert.throws(() => summarizeUpstreamReadiness([a, a]));
  assert.throws(() => summarizeUpstreamReadiness([a, { ...b, advisory: "GHSA-fake" }]));
  assert.throws(() => summarizeUpstreamReadiness(null));
  assert.equal(summarizeUpstreamReadiness([
    { ...a, status: "UPSTREAM_REVIEW_REQUIRED" }, b,
  ]).status, "MANUAL_SECURITY_REVIEW_REQUIRED");
});

test("B178 pnpm v9 detects exact package and snapshot, not guessed versions", async () => {
  const source = await readFile("pnpm-lock.yaml", "utf8");
  assert.equal(installedVersion(source, forge.packageName), "1.4.0");
  assert.equal(installedVersion(source, braces.packageName), "3.0.3");
  assert.throws(() => installedVersion(source.replace("lockfileVersion: '9.0'",
    "lockfileVersion: '8.0'"), forge.packageName));
  assert.throws(() => installedVersion(source.replace(
    "  node-forge@1.4.0:", "  node-forge@1.4.1:"), forge.packageName));
  assert.throws(() => installedVersion(source + "\n  braces@3.0.3:\n", braces.packageName));
});

test("B178 source does not introduce audit exclusions, dependency changes or write paths", async () => {
  const text = await readFile("scripts/security/check-upstream-patch-readiness.mjs", "utf8");
  assert.doesNotMatch(text, /writeFile|appendFile|child_process|exec\(|spawn\(|git push|pnpm add|override|ignoreAdvisory|audit-level low/u);
  assert.match(text, /registry\.npmjs\.org/u);
  assert.match(text, /api\.github\.com/u);
  assert.match(text, /AbortSignal\.timeout/u);
});
