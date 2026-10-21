import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PATCHED_VERSION = "1.16.1";
const PACKAGE = "follow-redirects";
const EXPECTED_REGISTRY_INTEGRITY =
  "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==";

function count(source, fragment) {
  return source.split(fragment).length - 1;
}

/**
 * Observe the frozen pnpm v9 lock, not node_modules or npm's advisory cache.
 * Security gate for a specific patched package, never an audit exemption.
 */
export function inspectFollowRedirectsLock(source) {
  assert.equal(typeof source, "string");
  assert.match(source, /^lockfileVersion: '9\.0'\r?\n/u, "unexpected pnpm lockfile format");

  const [packages, snapshots] = source.split(/\r?\nsnapshots:\r?\n/u);
  assert.ok(packages && snapshots, "lockfile snapshot section missing");
  const versions = [packages, snapshots].map((section) =>
    [...section.matchAll(/^  follow-redirects@([^:\n]+):/gmu)]
      .map((match) => match[1]),
  );
  assert.deepEqual(versions, [[PATCHED_VERSION], [PATCHED_VERSION]],
    "exactly one package and one snapshot at the patched version required");

  const resolution = packages.match(
    /^  follow-redirects@1\.16\.1:\s*\r?\n    resolution: \{integrity: (sha512-[A-Za-z0-9+/=]+)\}/mu,
  );
  assert.ok(resolution, "patched package integrity must be present");
  assert.equal(resolution[1], EXPECTED_REGISTRY_INTEGRITY,
    "integrity must equal the independently checked npm 1.16.1 tarball");
  assert.match(snapshots,
    /^  follow-redirects@1\.16\.1: \{\}\s*$/mu,
    "installed snapshot must resolve to patched package");
  assert.match(snapshots,
    /^  axios@1\.20\.0:\s*\r?\n    dependencies:\s*\r?\n      follow-redirects: 1\.16\.1\s*$/mu,
    "Axios production edge must select the patched package");

  assert.equal(count(source, "follow-redirects: 1.16.1"), 1,
    "exactly one Axios dependency edge expected");
  assert.equal(count(source, "follow-redirects@1.16.0"), 0,
    "no vulnerable package or snapshot may remain");

  return {
    event: "security.follow_redirects.frozen_lock",
    status: "PINNED_PATCHED",
    version: PATCHED_VERSION,
    consumer: "apps/web -> axios@1.20.0",
    registryIntegrityMatched: true,
    releaseAuthorized: false,
    productionAuditCertified: false,
  };
}

async function main() {
  try {
    assert.equal(process.argv.length, 2, "usage: node scripts/security/check-follow-redirects-lock.mjs");
    const source = await readFile("pnpm-lock.yaml", "utf8");
    console.log(JSON.stringify(inspectFollowRedirectsLock(source)));
  } catch (error) {
    console.error(JSON.stringify({
      event: "security.follow_redirects.frozen_lock",
      status: "INVALID",
      reason: error instanceof Error ? error.message : "unknown",
      releaseAuthorized: false,
      productionAuditCertified: false,
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
