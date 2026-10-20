import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

// MongoDB 8.0 on Linux: SERVER-121912 / SERVER-125742.
// Certain kernel versions 6.19 through 7.0.13 conflict with the
// MongoDB-vendored TCMalloc allocator. Do not attempt to bypass the
// mongod safety check with flags, sysctls, or undocumented patches.
export function classifyMongoCiKernel(release) {
  assert.equal(typeof release, "string", "Linux kernel release must be text");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9._+-]+)?$/u.exec(
    release.trim(),
  );
  assert.ok(match, "Unrecognized Linux kernel release; cannot prove MongoDB compatibility");
  const [major, minor, patch] = match.slice(1).map(Number);
  assert.ok(
    [major, minor, patch].every(Number.isSafeInteger),
    "Linux kernel version exceeds safe integer range",
  );

  const affected = (major === 6 && minor >= 19) ||
    (major === 7 && minor === 0 && patch < 14);
  return {
    event: "ci.mongo_kernel.compatibility",
    kernelRelease: release.trim(),
    status: affected ? "BLOCKED" : "COMPATIBLE_RANGE",
    reason: affected ? "MONGO_TCMALLOC_KERNEL_INCOMPATIBLE" : "KERNEL_OUTSIDE_KNOWN_INCOMPATIBLE_RANGE",
    mongoVersionFamily: "8.0",
    validatedByMongoStartup: false,
    productionCertified: false,
  };
}

async function main() {
  try {
    assert.equal(process.platform, "linux", "Mongo smoke runner must be Linux");
    assert.equal(process.argv.length, 2, "usage: node scripts/ci/check-mongo-kernel.mjs");
    const result = classifyMongoCiKernel(
      execFileSync("uname", ["-r"], { encoding: "utf8", timeout: 5000 }),
    );
    console.log(JSON.stringify(result));
    if (result.status !== "COMPATIBLE_RANGE") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      event: "ci.mongo_kernel.compatibility",
      status: "INVALID_EVIDENCE",
      reason: error instanceof Error ? error.message : "unknown",
      validatedByMongoStartup: false,
      productionCertified: false,
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
