import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectExpoExportDirectory,
  MAX_EXPO_EXPORT_BYTES,
  verifyExpoNativeExport,
} from "./verify-expo-native-export.mjs";

const android = "_expo/static/js/android/entry-a.hbc";
const ios = "_expo/static/js/ios/entry-b.hbc";
const metadata = {
  version: 0,
  bundler: "metro",
  fileMetadata: {
    android: { bundle: android, assets: [] },
    ios: { bundle: ios, assets: [] },
  },
};
const sha256 = "a".repeat(64);
const rows = () => [
  { name: "metadata.json", bytes: 130, sha256 },
  { name: android, bytes: 450, sha256 },
  { name: ios, bytes: 550, sha256: "b".repeat(64) },
];

test("accepts both native platform bundles, hashes and explicit HOLD", () => {
  const actual = verifyExpoNativeExport(metadata, rows());
  assert.deepEqual(actual.platforms, ["android", "ios"]);
  assert.equal(actual.fileCount, 3);
  assert.equal(actual.totalBytes, 1130);
  assert.match(actual.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(actual.bundles.android.bytes, 450);
  assert.equal(actual.bundles.ios.bytes, 550);
  assert.equal(actual.productionAuditCertified, false);
  assert.equal(actual.releaseAuthorized, false);
  assert.deepEqual(
    verifyExpoNativeExport(metadata, rows().reverse()),
    actual,
    "file discovery order cannot influence immutable output",
  );
});

test("fails closed when either platform or its bundle is absent", () => {
  assert.throws(
    () => verifyExpoNativeExport(metadata, rows().filter((x) => x.name !== ios)),
    /missing ios bundle file/u,
  );
  assert.throws(
    () => verifyExpoNativeExport({ ...metadata, fileMetadata: { android: metadata.fileMetadata.android } }, rows()),
    /missing ios export metadata/u,
  );
  assert.throws(
    () => verifyExpoNativeExport({ ...metadata, bundler: "webpack" }, rows()),
    /must use Metro/u,
  );
  assert.throws(
    () => verifyExpoNativeExport({ ...metadata, fileMetadata: {
      ...metadata.fileMetadata,
      ios: { bundle: "_expo/static/js/android/not-an-ios.hbc" },
    } }, rows()),
    /unexpected ios bundle directory/u,
  );
});

test("rejects traversal, absolute paths, duplicate entries and invalid hashes", () => {
  for (const invalid of [
    { name: "../credential.json", bytes: 40, sha256 },
    { name: "/absolute/path", bytes: 40, sha256 },
    { name: "wrong\\windows\\path", bytes: 40, sha256 },
    { name: "nested//file", bytes: 40, sha256 },
    { name: ios, bytes: 40, sha256 },
    { name: "asset.file", bytes: 40, sha256: "invalid" },
  ]) {
    assert.throws(() => verifyExpoNativeExport(metadata, [...rows(), invalid]));
  }
});

test("prevents exporting signing keys, app secrets and service account files", () => {
  for (const name of [
    ".env",
    ".env.production",
    "secrets/key.pem",
    "secrets/device.p12",
    "android/release.keystore",
    "ios/GoogleService-Info.plist",
    "android/google-services.json",
    "secrets/credentials.json",
    "keys/service-account.json",
  ]) {
    assert.throws(
      () => verifyExpoNativeExport(metadata, [...rows(), { name, bytes: 123, sha256 }]),
      /sensitive credential filename/u,
      name,
    );
  }
});

test("enforces bounded nonempty export size and metadata presence", () => {
  assert.throws(
    () => verifyExpoNativeExport(metadata, rows().filter((x) => x.name !== "metadata.json")),
    /metadata file is missing/u,
  );
  assert.throws(
    () => verifyExpoNativeExport(metadata, [
      ...rows(),
      { name: "assets/big", bytes: MAX_EXPO_EXPORT_BYTES, sha256 },
    ]),
    /exceeds byte budget/u,
  );
  assert.throws(
    () => verifyExpoNativeExport(metadata, [...rows(), { name: "assets/empty", bytes: 0, sha256 }]),
    /empty or invalid/u,
  );
});

test("walks a real temporary directory and rejects symlinks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "b219-native-export-"));
  try {
    await mkdir(path.join(root, "_expo/static/js/android"), { recursive: true });
    await mkdir(path.join(root, "_expo/static/js/ios"), { recursive: true });
    await writeFile(path.join(root, "metadata.json"), JSON.stringify(metadata));
    await writeFile(path.join(root, ...android.split("/")), "android bundle");
    await writeFile(path.join(root, ...ios.split("/")), "ios bundle");
    const ok = await inspectExpoExportDirectory(root);
    assert.deepEqual(ok.platforms, ["android", "ios"]);
    assert.match(ok.sha256, /^[a-f0-9]{64}$/u);
    await symlink(path.join(root, "metadata.json"), path.join(root, "leaked-metadata.json"));
    await assert.rejects(
      () => inspectExpoExportDirectory(root),
      /symbolic link/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
