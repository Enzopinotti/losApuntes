import assert from "node:assert/strict";
import test from "node:test";

import { classifyMongoCiKernel } from "./check-mongo-kernel.mjs";

test("B156 accepts Linux kernels outside MongoDB-vendored TCMalloc affected range", () => {
  for (const version of [
    "5.15.0-105-generic",
    "6.8.0-1018-azure",
    "6.18.99",
    "7.0.14",
    "7.0.14-azure",
    "7.1.0",
    "8.0.0",
  ]) {
    const result = classifyMongoCiKernel(version);
    assert.equal(result.status, "COMPATIBLE_RANGE", version);
    assert.equal(result.productionCertified, false);
    assert.equal(result.validatedByMongoStartup, false);
  }
});

test("B156 blocks known 6.19+ through 7.0.13 kernel range without bypass", () => {
  for (const version of [
    "6.19.0",
    "6.19.14-1021-azure",
    "6.20.0-1000-generic",
    "6.99.10",
    "7.0.0-38-generic",
    "7.0.13",
  ]) {
    const result = classifyMongoCiKernel(version);
    assert.equal(result.status, "BLOCKED", version);
    assert.equal(result.reason, "MONGO_TCMALLOC_KERNEL_INCOMPATIBLE");
    assert.equal(result.validatedByMongoStartup, false);
  }
});

test("B156 unknown versions fail closed rather than assuming MongoDB can start", () => {
  for (const version of [
    "", "6.19", "Linux 6.8.0", "6.8.0 extra", "6.19.0;true",
    "7.0.0/unsafe", "99999999999999999999.0.0", null, 619,
  ]) {
    assert.throws(() => classifyMongoCiKernel(version), undefined, String(version));
  }
});

test("B156 numeric Linux kernel detection handles zero and leading digits exactly", () => {
  assert.equal(classifyMongoCiKernel("6.18.0").status, "COMPATIBLE_RANGE");
  assert.equal(classifyMongoCiKernel("6.19.0").status, "BLOCKED");
  assert.equal(classifyMongoCiKernel("7.0.13").status, "BLOCKED");
  assert.equal(classifyMongoCiKernel("7.0.14").status, "COMPATIBLE_RANGE");
});
