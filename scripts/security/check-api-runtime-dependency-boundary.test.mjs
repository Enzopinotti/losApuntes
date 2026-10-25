import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { inspectApiPnpmStore } from "./check-api-runtime-dependency-boundary.mjs";

const productionPackages = [
  "@nestjs+core@11.2.5",
  "fastify@5.12.5",
  "mongoose@8.24.4",
  "rxjs@7.8.2",
];

test("allows a bounded API-only production dependency store", () => {
  assert.deepEqual(inspectApiPnpmStore(productionPackages), {
    event: "security.api_runtime_dependency_boundary.valid",
    packageCount: productionPackages.length,
    absentPackages: ["braces", "node-forge", "zod"],
  });
});

test("fails when the API runtime install is empty or incomplete", () => {
  assert.throws(
    () => inspectApiPnpmStore([]),
    /must exist and contain installed packages/u,
  );
  assert.throws(
    () => inspectApiPnpmStore(["braces@3.0.3"]),
    /API runtime package missing/u,
  );
});

test("rejects Mobile tooling packages regardless of version or peer suffix", () => {
  for (const exposed of [
    "braces@3.0.3",
    "braces@3.0.4",
    "node-forge@1.4.0",
    "node-forge@1.4.0(peer@1.0.0)",
  ]) {
    assert.throws(
      () => inspectApiPnpmStore([...productionPackages, exposed]),
      /Unreviewed Mobile toolchain dependency found/u,
      exposed,
    );
  }
});

test("a similarly named package does not count as a vulnerable exact package", () => {
  assert.doesNotThrow(() =>
    inspectApiPnpmStore([...productionPackages, "braces-helper@1.0.0"]),
  );
});

test("production Dockerfile enforces the check after the filtered install", () => {
  const dockerfile = readFileSync(
    new URL("../../apps/api/Dockerfile", import.meta.url),
    "utf8",
  );
  const install = dockerfile.indexOf(
    "pnpm install --frozen-lockfile --prod --filter @losapuntes/api...",
  );
  const verify = dockerfile.indexOf(
    "RUN node scripts/security/check-api-runtime-dependency-boundary.mjs",
  );

  assert.notEqual(install, -1, "filtered production install missing");
  assert.ok(
    verify > install,
    "runtime dependency boundary must run after install",
  );
  assert.match(
    dockerfile,
    /COPY scripts\/security\/check-api-runtime-dependency-boundary\.mjs scripts\/security\/check-api-runtime-dependency-boundary\.mjs/u,
  );
});
