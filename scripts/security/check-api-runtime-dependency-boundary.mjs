import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Keep the installed API runtime isolated from native Expo tooling and its
// known high-risk transitive packages, including the newly reported Zod HIGH.
// A future legitimate API use of Zod requires an explicit review of this
// boundary, not a silent relaxation or a dependency-audit waiver.
const prohibited = ["braces", "node-forge", "zod"];
const expectedApiPackages = ["@nestjs+core@", "fastify@", "mongoose@"];

// This checks the packages that pnpm actually installed in the filtered,
// production-only API image. It is not a replacement for pnpm audit.
export function inspectApiPnpmStore(packageEntries) {
  assert.ok(
    Array.isArray(packageEntries) && packageEntries.length > 0,
    "API production pnpm store must exist and contain installed packages",
  );
  assert.ok(
    packageEntries.every((entry) => typeof entry === "string"),
    "pnpm store entries must be names",
  );

  for (const prefix of expectedApiPackages) {
    assert.ok(
      packageEntries.some((entry) => entry.startsWith(prefix)),
      `API runtime package missing from production install: ${prefix}`,
    );
  }

  const violations = packageEntries.filter((entry) =>
    prohibited.some((name) => entry.startsWith(`${name}@`)),
  );
  assert.deepEqual(
    violations,
    [],
    "Unreviewed Mobile toolchain dependency found in the API runtime pnpm store",
  );

  return {
    event: "security.api_runtime_dependency_boundary.valid",
    packageCount: packageEntries.length,
    absentPackages: prohibited,
  };
}

export async function checkApiRuntimeDependencyBoundary(root = process.cwd()) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "apps/api/package.json"), "utf8"),
  );
  assert.equal(
    manifest.name,
    "@losapuntes/api",
    "API runtime boundary must run against the API workspace",
  );
  const installed = await readdir(path.join(root, "node_modules/.pnpm"));
  return inspectApiPnpmStore(installed);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const result = await checkApiRuntimeDependencyBoundary();
  console.log(JSON.stringify(result));
}
