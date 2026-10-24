import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkExpoRiskLockBoundary } from "./check-expo-risk-lock-boundary.mjs";

function fixture() {
  const padding = Array.from({ length: 105 }, (_, index) =>
    "  filler-" + index + "@1.0.0: {}",
  );
  return [
    "lockfileVersion: '9.0'",
    "importers:",
    "  .:",
    "    devDependencies:",
    "      playwright:",
    "        version: 1.0.0",
    "  apps/api:",
    "    dependencies:",
    "      safe-api:",
    "        version: 1.0.0",
    "  apps/web:",
    "    dependencies:",
    "      safe-web:",
    "        version: 1.0.0",
    "  apps/mobile:",
    "    dependencies:",
    "      expo:",
    "        version: 57.0.25",
    "      '@losapuntes/contracts':",
    "        version: link:../../packages/contracts",
    "  packages/contracts:",
    "    devDependencies:",
    "      typescript:",
    "        version: 6.0.3",
    "packages:",
    "  braces@3.0.3:",
    "    resolution: {integrity: sha512-fake}",
    "  node-forge@1.4.0:",
    "    resolution: {integrity: sha512-fake}",
    "snapshots:",
    ...padding,
    "  safe-api@1.0.0: {}",
    "  safe-web@1.0.0: {}",
    "  expo@57.0.25:",
    "    dependencies:",
    "      '@expo/cli': 57.0.27",
    "      metro-file-map: 0.84.5",
    "  '@expo/cli@57.0.27':",
    "    dependencies:",
    "      node-forge: 1.4.0",
    "  metro-file-map@0.84.5:",
    "    dependencies:",
    "      micromatch: 4.0.8",
    "  micromatch@4.0.8:",
    "    dependencies:",
    "      braces: 3.0.3",
    "  node-forge@1.4.0: {}",
    "  braces@3.0.3: {}",
    "",
  ].join("\n");
}

test("B195 known Mobile exposure remains visible and never certifies release", () => {
  const result = checkExpoRiskLockBoundary(fixture());
  assert.equal(result.status, "CONFINED_BUT_VULNERABLE");
  assert.equal(result.productionAuditCertified, false);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.apiSnapshotCount, 1);
  assert.equal(result.webSnapshotCount, 1);
  assert.ok(result.mobileSnapshotCount >= 6);
  assert.deepEqual(result.riskPackages.map((entry) => entry.name), ["braces", "node-forge"]);
  for (const entry of result.riskPackages) {
    assert.equal(entry.apiReachable, false);
    assert.equal(entry.webReachable, false);
    assert.equal(entry.mobileReachable, true);
  }
});

test("B195 rejects unexpected API/Web runtime exposure", () => {
  for (const app of ["apps/api", "apps/web"]) {
    for (const name of ["braces", "node-forge"]) {
      const version = name === "braces" ? "3.0.3" : "1.4.0";
      const mutated = fixture().replace(
        "  " + app + ":\n    dependencies:",
        "  " + app + ":\n    dependencies:\n      " + name + ":\n        version: " + version,
      );
      assert.throws(
        () => checkExpoRiskLockBoundary(mutated),
        /vulnerable Expo tooling reached (?:API|Web) runtime graph/u,
      );
    }
  }
});

test("B195 rejects new direct vulnerable package parents, even if unreachable", () => {
  for (const name of ["braces", "node-forge"]) {
    const version = name === "braces" ? "3.0.3" : "1.4.0";
    const changed = fixture() + [
      "  unexpected-parent@1.0.0:",
      "    dependencies:",
      "      " + name + ": " + version,
      "",
    ].join("\n");
    assert.throws(() => checkExpoRiskLockBoundary(changed), /unexpected vulnerable package parent/u);
  }
});

test("B195 requires explicit review if an old Mobile advisory disappears", () => {
  for (const edge of ["      braces: 3.0.3\n", "      node-forge: 1.4.0\n"]) {
    assert.throws(
      () => checkExpoRiskLockBoundary(fixture().replace(edge, "")),
      /known Mobile exposure moved/u,
    );
  }
});

test("B195 rejects malformed, truncated and migration drift", () => {
  assert.throws(
    () => checkExpoRiskLockBoundary(fixture().replace("lockfileVersion: '9.0'", "lockfileVersion: '8.0'")),
    /pnpm v9 only/u,
  );
  assert.throws(
    () => checkExpoRiskLockBoundary(fixture().replaceAll(/^  filler-\d+@1\.0\.0: \{\}\n/gmu, "")),
    /snapshot graph truncated/u,
  );
  assert.throws(
    () => checkExpoRiskLockBoundary(fixture().replace("  node-forge@1.4.0:\n    resolution:", "  node-forge@1.4.1:\n    resolution:")),
    /risk package requires re-review/u,
  );
});

test("B195 rejects unknown refs and linked workspace changes", () => {
  assert.throws(
    () => checkExpoRiskLockBoundary(fixture().replace("version: 1.0.0\n  apps/web", "version: npm:other@1.0.0\n  apps/web")),
    /unexpected dependency ref/u,
  );
  assert.throws(
    () => checkExpoRiskLockBoundary(fixture().replace("link:../../packages/contracts", "link:../../unknown/private")),
    /unknown workspace link/u,
  );
});

test("B195 probes exact checked-out production lock, not a canned green response", async () => {
  const actual = await readFile(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");
  const result = checkExpoRiskLockBoundary(actual);
  assert.equal(result.status, "CONFINED_BUT_VULNERABLE");
  assert.equal(result.releaseAuthorized, false);
  assert.ok(result.apiSnapshotCount > 50);
  assert.ok(result.webSnapshotCount > 20);
  assert.ok(result.mobileSnapshotCount > 300);
});
