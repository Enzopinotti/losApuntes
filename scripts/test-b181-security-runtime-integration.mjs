import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyMongoCiKernel } from "./ci/check-mongo-kernel.mjs";
import { inspectFollowRedirectsLock } from "./security/check-follow-redirects-lock.mjs";

const read = (path) => readFile(path, "utf8");

// Neither integration parent must be subtly watered down to make CI green.
const lock = await read("pnpm-lock.yaml");
const pinned = inspectFollowRedirectsLock(lock);
assert.equal(pinned.status, "PINNED_PATCHED");
assert.equal(pinned.version, "1.16.1");
assert.equal(pinned.productionAuditCertified, false);
assert.equal(pinned.releaseAuthorized, false);

const verify = await read(".github/workflows/ci.yml");
const smoke = verify.match(/\n  runtime-smoke:\n([\s\S]*)$/u)?.[1];
assert.ok(smoke, "Canonical global container smoke must still exist");
assert.match(smoke, /name: Container runtime smoke/u);
assert.match(smoke, /runs-on: ubuntu-22\.04/u);
assert.match(smoke, /node --test scripts\/ci\/check-mongo-kernel\.test\.mjs/u);
assert.match(smoke, /node scripts\/ci\/check-mongo-kernel\.mjs/u);
assert.match(smoke, /docker compose -f compose\.local\.yml -f compose\.health\.yml up --build -d --wait/u);
assert.match(smoke, /pnpm test:auth-browser-e2e/u);
assert.match(smoke, /node scripts\/smoke-account-export-lifecycle\.mjs/u);
assert.match(smoke, /if: always\(\)/u);
assert.match(
  verify,
  /Audit production dependency graph\s*\n\s*run: pnpm audit --prod --audit-level high/u,
  "Remediating two highs must not bypass the other HIGH production advisories",
);
assert.doesNotMatch(
  verify,
  /name: Container runtime smoke[\s\S]*?continue-on-error: true/u,
  "Runtime smoke must stay strict",
);

for (const release of ["6.19.0", "6.20.1-azure", "7.0.13"]) {
  assert.equal(classifyMongoCiKernel(release).status, "BLOCKED");
}
for (const release of ["5.15.0-generic", "6.8.0-1040-azure", "7.0.14"]) {
  const evidence = classifyMongoCiKernel(release);
  assert.equal(evidence.status, "COMPATIBLE_RANGE");
  assert.equal(evidence.validatedByMongoStartup, false);
  assert.equal(evidence.productionCertified, false);
}
for (const release of ["6.19", "not-a-kernel", "7.0.13;true"]) {
  assert.throws(() => classifyMongoCiKernel(release));
}

const redirectRegression = await read(
  "scripts/security/test-follow-redirects-regression.mjs",
);
assert.match(redirectRegression, /127\.0\.0\.1/u);
assert.match(redirectRegression, /127\.0\.0\.2/u);
assert.match(redirectRegression, /sensitiveHeaders/u);
assert.match(redirectRegression, /authorization/u);
assert.match(redirectRegression, /cookie/u);
const bootstrap = await read(".github/workflows/b156-mongo-kernel-bootstrap.yml");
assert.match(bootstrap, /runs-on: ubuntu-22\.04/u);
assert.match(bootstrap, /mongosh --quiet --eval/u);
assert.match(bootstrap, /isWritablePrimary/u);

console.log(
  JSON.stringify({
    event: "b181.security_runtime.integration",
    status: "SOURCE_CONTRACT_PASS",
    pinnedFollowRedirects: pinned.version,
    mongoKernelPreflight: "FAIL_CLOSED",
    canonicalContainerSmoke: "REQUIRED",
    productionAudit: "REQUIRED",
    runtimeCertified: false,
    releaseAuthorized: false,
  }),
);
