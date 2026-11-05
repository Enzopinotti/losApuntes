import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLATFORMS = ['ios', 'android'];
const WATCHED = ['node-forge', 'braces'];
const MAX_FILES = 2500;
const MAX_MAP_BYTES = 120 * 1024 * 1024;
const MAX_TOTAL_MAP_BYTES = 300 * 1024 * 1024;
const MAX_SOURCES = 50000;

function normalizeSourcePath(sourceRoot, source) {
  assert.equal(typeof source, 'string', 'source-map source must be a string');
  assert.equal(typeof sourceRoot, 'string', 'sourceRoot must be a string');
  let value = sourceRoot + '/' + source;
  try {
    value = decodeURIComponent(value);
  } catch {
    throw new Error('source map contains invalid URL escaping');
  }
  return value.replaceAll('\\', '/');
}

export function classifyMetroSourcePath(sourceRoot, source) {
  const normalized = normalizeSourcePath(sourceRoot, source);
  const segments = normalized.split('/');
  const hits = WATCHED.filter((name) => {
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === name && (
        i > 0 && segments[i - 1] === 'node_modules' ||
        i > 0 && segments[i - 1].startsWith('node_modules') ||
        i > 1 && segments[i - 2] === 'node_modules' && segments[i - 1].startsWith('.pnpm')
      )) return true;
    }
    // pnpm source-map paths can use the virtual package directory directly:
    // node_modules/.pnpm/node-forge@1.4.0/node_modules/node-forge/lib/index.js
    return segments.some((part, index) =>
      part.startsWith(name + '@') && index > 0 && segments[index - 1] === '.pnpm');
  });
  return { hits, normalized };
}

export function inspectNativeSourceMapDocument(doc) {
  assert.ok(doc && typeof doc === 'object' && !Array.isArray(doc), 'source map must be a JSON object');
  assert.equal(doc.version, 3, 'unsupported source-map version');
  assert.ok(Array.isArray(doc.sources) && doc.sources.length > 0, 'source map missing module sources');
  assert.ok(doc.sources.length <= MAX_SOURCES, 'source map source count exceeds budget');
  const sourceRoot = doc.sourceRoot ?? '';
  assert.equal(typeof sourceRoot, 'string', 'invalid source-map sourceRoot');
  const matches = new Set();
  let nodeModulesCount = 0;
  for (const source of doc.sources) {
    const { hits, normalized } = classifyMetroSourcePath(sourceRoot, source);
    for (const name of hits) matches.add(name);
    if (normalized.includes('/node_modules/')) nodeModulesCount++;
  }
  return { matches: [...matches].sort(), sourceCount: doc.sources.length, nodeModulesCount };
}

async function walkMaps(root) {
  const queue = [root];
  const maps = [];
  let artifacts = 0;
  let traversed = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      traversed++;
      assert.ok(traversed <= MAX_FILES, 'bundle output exceeds bounded file budget');
      const file = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'symlink in exported bundle output');
      if (entry.isDirectory()) queue.push(file);
      else {
        assert.ok(entry.isFile(), 'non-file entry in exported bundle output');
        if (/\.(?:js|hbc|bundle|jsbundle)$/u.test(entry.name)) artifacts++;
        if (/\.(?:js|hbc|bundle|jsbundle)\.map$/u.test(entry.name)) maps.push(file);
      }
    }
  }
  assert.ok(artifacts > 0, 'native JavaScript export is empty');
  assert.ok(maps.length > 0, 'native JavaScript source maps missing');
  return { maps, artifacts };
}

/**
 * Evidence that no watched packages were bundled as native JS modules.
 * Not evidence that build-time Expo/Metro dependencies are safe or patched.
 */
export async function inspectNativeBundleSourceMaps(platformDirs) {
  const result = {
    event: 'security.mobile_native_bundle.provenance',
    status: 'INSPECTED',
    platformEvidence: {},
    watchedPackageNames: WATCHED,
    productionAuditCertified: false,
    releaseAuthorized: false,
  };
  for (const platform of PLATFORMS) {
    const dir = platformDirs[platform];
    assert.equal(typeof dir, 'string', 'missing native export path: ' + platform);
    const info = await stat(dir);
    assert.ok(info.isDirectory(), 'native export directory missing: ' + platform);
    const { maps, artifacts } = await walkMaps(dir);
    let modules = 0;
    let thirdPartySources = 0;
    let totalMapBytes = 0;
    const exposed = new Set();
    for (const file of maps) {
      const fileInfo = await stat(file);
      assert.ok(fileInfo.size > 0 && fileInfo.size <= MAX_MAP_BYTES,
        'unbounded or empty source map');
      totalMapBytes += fileInfo.size;
      assert.ok(totalMapBytes <= MAX_TOTAL_MAP_BYTES, 'source-map byte budget exceeded');
      const doc = JSON.parse(await readFile(file, 'utf8'));
      const inspected = inspectNativeSourceMapDocument(doc);
      modules += inspected.sourceCount;
      thirdPartySources += inspected.nodeModulesCount;
      for (const name of inspected.matches) exposed.add(name);
    }
    assert.ok(modules > 0 && thirdPartySources > 0,
      'native maps have no meaningful third-party module provenance');
    result.platformEvidence[platform] = {
      bundleFiles: artifacts,
      mapFiles: maps.length,
      sourceEntries: modules,
      thirdPartySources,
      exposedPackages: [...exposed].sort(),
    };
    if (exposed.size > 0) result.status = 'EXPOSED';
  }
  return result;
}

async function main() {
  try {
    assert.equal(process.argv.length, 4,
      'usage: node check-mobile-native-bundle-provenance.mjs <ios-export-dir> <android-export-dir>');
    const result = await inspectNativeBundleSourceMaps({
      ios: process.argv[2],
      android: process.argv[3],
    });
    console.log(JSON.stringify(result));
    if (result.status !== 'INSPECTED') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'security.mobile_native_bundle.provenance',
      status: 'INVALID_EVIDENCE',
      reason: error instanceof Error ? error.message : 'unknown error',
      productionAuditCertified: false,
      releaseAuthorized: false,
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
