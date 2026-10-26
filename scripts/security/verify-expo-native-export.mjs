import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_EXPO_EXPORT_FILES = 5_000;
export const MAX_EXPO_EXPORT_BYTES = 512 * 1024 * 1024;
const MAX_METADATA_BYTES = 1_048_576;
const REQUIRED_PLATFORMS = ["android", "ios"];

function safeRelative(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 512 &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    !name.startsWith("/") &&
    !/^[A-Za-z]:/u.test(name) &&
    name.split("/").every((component) => component !== "" && component !== "." && component !== "..")
  );
}

function sensitiveExport(name) {
  const basename = name.split("/").at(-1);
  return (
    /^\.env(?:\.|$)/iu.test(basename) ||
    /\.(?:pem|p12|pfx|key|keystore|jks)$/iu.test(basename) ||
    /^(?:google-services\.json|GoogleService-Info\.plist|credentials\.json|service-account(?:\.|$))/iu.test(basename)
  );
}

/**
 * Pure release artifact contract. Results are deterministic SHA-256 metadata,
 * NOT a security audit, native binary or a production release approval.
 * entries: [{name,bytes,sha256}].
 */
export function verifyExpoNativeExport(metadata, entries) {
  assert.ok(metadata && typeof metadata === "object" && !Array.isArray(metadata), "missing Expo metadata");
  assert.equal(metadata.bundler, "metro", "Expo export must use Metro");
  assert.ok(metadata.fileMetadata && typeof metadata.fileMetadata === "object", "missing per-platform bundle metadata");
  assert.ok(Array.isArray(entries) && entries.length > 0, "export must contain files");
  assert.ok(entries.length <= MAX_EXPO_EXPORT_FILES, "export exceeds file count budget");

  const files = new Map();
  let totalBytes = 0;
  for (const entry of entries) {
    assert.ok(entry && typeof entry === "object", "invalid file record");
    assert.ok(safeRelative(entry.name), "unsafe relative export path");
    assert.ok(!sensitiveExport(entry.name), "sensitive credential filename in Expo artifact");
    assert.ok(!files.has(entry.name), "duplicate Expo export path");
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, "empty or invalid export file");
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u, "invalid file SHA-256");
    totalBytes += entry.bytes;
    assert.ok(totalBytes <= MAX_EXPO_EXPORT_BYTES, "Expo export exceeds byte budget");
    files.set(entry.name, entry);
  }
  assert.ok(files.has("metadata.json"), "native export metadata file is missing");

  const bundles = {};
  for (const platform of REQUIRED_PLATFORMS) {
    const meta = metadata.fileMetadata[platform];
    assert.ok(meta && typeof meta === "object", `missing ${platform} export metadata`);
    const bundle = meta.bundle;
    assert.ok(safeRelative(bundle), `invalid ${platform} bundle path`);
    assert.ok(bundle.startsWith(`_expo/static/js/${platform}/`), `unexpected ${platform} bundle directory`);
    assert.match(bundle, /\.(?:hbc|js)$/u, `unexpected ${platform} bundle extension`);
    assert.ok(files.has(bundle), `missing ${platform} bundle file`);
    bundles[platform] = { bytes: files.get(bundle).bytes, sha256: files.get(bundle).sha256 };
  }

  const overall = createHash("sha256");
  for (const name of [...files.keys()].sort()) {
    const file = files.get(name);
    overall.update(name, "utf8");
    overall.update("\0");
    overall.update(String(file.bytes));
    overall.update("\0");
    overall.update(file.sha256);
    overall.update("\n");
  }
  return {
    event: "mobile.expo_dual_platform_export.accepted",
    platforms: REQUIRED_PLATFORMS,
    fileCount: entries.length,
    totalBytes,
    sha256: overall.digest("hex"),
    bundles,
    productionAuditCertified: false,
    releaseAuthorized: false,
  };
}

async function hashFile(filename) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest("hex");
}

export async function inspectExpoExportDirectory(directory) {
  const root = path.resolve(directory);
  const rootStat = await lstat(root);
  assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "export root must be a real directory");
  const entries = [];
  let runningBytes = 0;

  async function visit(subdir) {
    const children = await readdir(path.join(root, subdir), { withFileTypes: true });
    for (const child of children) {
      const relative = subdir ? subdir + "/" + child.name : child.name;
      assert.ok(safeRelative(relative), "unsafe filesystem export path");
      const filename = path.join(root, ...relative.split("/"));
      const info = await lstat(filename);
      assert.ok(!info.isSymbolicLink(), "export contains a symbolic link");
      if (info.isDirectory()) {
        await visit(relative);
        continue;
      }
      assert.ok(info.isFile(), "export contains a non-file");
      assert.ok(!sensitiveExport(relative), "sensitive credential filename in Expo artifact");
      assert.ok(Number.isSafeInteger(info.size) && info.size > 0, "empty or invalid export file");
      entries.push({ name: relative, bytes: info.size, sha256: await hashFile(filename) });
      runningBytes += info.size;
      assert.ok(entries.length <= MAX_EXPO_EXPORT_FILES, "export exceeds file count budget");
      assert.ok(runningBytes <= MAX_EXPO_EXPORT_BYTES, "export exceeds byte budget");
    }
  }
  await visit("");

  const metadataRow = entries.find((row) => row.name === "metadata.json");
  assert.ok(metadataRow && metadataRow.bytes <= MAX_METADATA_BYTES, "missing or oversized metadata.json");
  const metadata = JSON.parse(await readFile(path.join(root, "metadata.json"), "utf8"));
  return verifyExpoNativeExport(metadata, entries);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  assert.equal(process.argv.length, 3, "usage: node verify-expo-native-export.mjs <dist-directory>");
  const result = await inspectExpoExportDirectory(process.argv[2]);
  console.log(JSON.stringify(result));
}
