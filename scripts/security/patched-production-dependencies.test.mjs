import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Guard the actual resolved graph, not only the package.json specifiers.
// This check does NOT replace the live production audit and does NOT authorize
// a release; unfixed and unreviewed HIGH advisories remain blocking.
const [rootSource, apiSource, lock] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("apps/api/package.json", "utf8"),
  readFile("pnpm-lock.yaml", "utf8"),
]);
const root = JSON.parse(rootSource);
const api = JSON.parse(apiSource);

function numericPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/u);
  assert.ok(match, "Expected numeric semver patch: " + version);
  return match.slice(1).map(Number);
}

function atLeast(version, minimum) {
  const actual = numericPatch(version);
  const bound = numericPatch(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] > bound[i]) return true;
    if (actual[i] < bound[i]) return false;
  }
  return true;
}

function graphVersions(packageName) {
  // Both pnpm package resolutions and snapshots are indented by two spaces.
  const safeName = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    "^  " + safeName + "@(\\d+\\.\\d+\\.\\d+):",
    "gmu",
  );
  return Array.from(lock.matchAll(pattern), (entry) => entry[1]);
}

test("Mongoose remains in the patched v8 release line", () => {
  assert.equal(api.dependencies.mongoose, "^8.24.7");
  const versions = graphVersions("mongoose");
  assert.ok(versions.length >= 2, "Expected package and snapshot entries");
  for (const version of versions) {
    assert.equal(version.startsWith("8."), true, "Stay on Mongoose v8");
    assert.equal(atLeast(version, "8.24.7"), true, version);
  }
  assert.match(lock, /specifier: \^8\.24\.7\s+version: 8\.24\./u);
  assert.doesNotMatch(lock, /mongoose@8\.24\.4/u);
});

test("all redirect copies use a release with cross-realm header protection", () => {
  assert.equal(root.pnpm.overrides["follow-redirects"], "1.16.2");
  const versions = graphVersions("follow-redirects");
  assert.ok(versions.length >= 2);
  for (const version of versions) {
    assert.equal(atLeast(version, "1.16.2"), true, version);
  }
  assert.doesNotMatch(lock, /follow-redirects@1\.16\.1/u);
});

test("all URI decoder copies use the fixed non-quadratic release", () => {
  assert.equal(root.pnpm.overrides["decode-uri-component"], "0.5.1");
  const versions = graphVersions("decode-uri-component");
  assert.ok(versions.length >= 2);
  for (const version of versions) {
    assert.equal(atLeast(version, "0.5.1"), true, version);
  }
  assert.doesNotMatch(lock, /decode-uri-component@0\.2\.2/u);
});

test("lockfile remains canonical, without security exceptions or a CI bypass", () => {
  assert.match(lock, /^lockfileVersion: '9\.0'/u);
  assert.match(lock, /^overrides:\s*$/mu);
  assert.match(lock, /^  follow-redirects: 1\.16\.2$/mu);
  assert.match(lock, /^  decode-uri-component: 0\.5\.1$/mu);
  assert.equal(root.scripts["audit:prod"], "pnpm audit --prod --audit-level high");
  assert.equal(root.pnpm.overrides["@nestjs/platform-fastify>fastify"], "5.12.5");
  assert.equal(root.pnpm.overrides["react-devtools-core>shell-quote"], "1.11.0");
});
