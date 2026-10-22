import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  classifyMetroSourcePath,
  inspectNativeBundleSourceMaps,
  inspectNativeSourceMapDocument,
} from './check-mobile-native-bundle-provenance.mjs';

const cleanSources = [
  '../../apps/mobile/src/App.tsx',
  '../../node_modules/react/index.js',
  '../../node_modules/expo-router/build/index.js',
];
const sourceMap = (sources = cleanSources, rest = {}) => ({
  version: 3,
  sources,
  names: [],
  mappings: '',
  ...rest,
});

async function withBuilds(fn) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'b152-native-provenance-'));
  const ios = path.join(temp, 'ios');
  const android = path.join(temp, 'android');
  await mkdir(ios, { recursive: true });
  await mkdir(android, { recursive: true });
  const write = async (platform, map = sourceMap(), file = 'index.js.map') => {
    const root = platform === 'ios' ? ios : android;
    await writeFile(path.join(root, 'index.js'), 'console.log("bundle");\n');
    await writeFile(path.join(root, file), JSON.stringify(map));
  };
  try {
    await fn({ temp, ios, android, write });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test('B152 identifies pnpm virtual and direct node_modules source paths', () => {
  const entries = [
    ['../../node_modules/.pnpm/node-forge@1.4.0/node_modules/node-forge/lib/rsa.js', ['node-forge']],
    ['../../node_modules/braces/lib/parse.js', ['braces']],
    ['../../node_modules/.pnpm/braces@3.0.3/node_modules/braces/index.js', ['braces']],
    ['../../../node_modules/node-forge/lib/index.js', ['node-forge']],
    ['../../node_modules/%62races/lib/index.js', ['braces']],
    ['../../apps/mobile/src/braces.ts', []],
    ['../../node_modules/node-forge-helper/index.js', []],
    ['../../node_modules/@expo/metro-runtime/index.js', []],
  ];
  for (const [source, expected] of entries) {
    assert.deepEqual(classifyMetroSourcePath('', source).hits, expected, source);
  }
});

test('B152 combines sourceRoot and detects crypto from bundle metadata', () => {
  const doc = sourceMap(['node_modules/node-forge/lib/rsa.js', 'node_modules/react/index.js'], {
    sourceRoot: '../',
  });
  assert.deepEqual(inspectNativeSourceMapDocument(doc), {
    matches: ['node-forge'], sourceCount: 2, nodeModulesCount: 2,
  });
});

test('B152 does not certify a native build or audit despite clean source maps', async () => {
  await withBuilds(async ({ ios, android, write }) => {
    await write('ios');
    await write('android');
    const result = await inspectNativeBundleSourceMaps({ ios, android });
    assert.equal(result.status, 'INSPECTED');
    assert.equal(result.releaseAuthorized, false);
    assert.equal(result.productionAuditCertified, false);
    assert.deepEqual(result.platformEvidence.ios.exposedPackages, []);
    assert.deepEqual(result.platformEvidence.android.exposedPackages, []);
    assert.equal(result.platformEvidence.ios.mapFiles, 1);
    assert.equal(result.platformEvidence.android.sourceEntries, 3);
  });
});

test('B152 rejects watched dependency in only one exported platform', async () => {
  await withBuilds(async ({ ios, android, write }) => {
    await write('ios', sourceMap([...cleanSources, '../../node_modules/braces/index.js']));
    await write('android');
    const result = await inspectNativeBundleSourceMaps({ ios, android });
    assert.equal(result.status, 'EXPOSED');
    assert.deepEqual(result.platformEvidence.ios.exposedPackages, ['braces']);
    assert.deepEqual(result.platformEvidence.android.exposedPackages, []);
    assert.equal(result.productionAuditCertified, false);
  });
});

test('B152 rejects the other watched package when it reaches Android', async () => {
  await withBuilds(async ({ ios, android, write }) => {
    await write('ios');
    await write('android', sourceMap([
      ...cleanSources,
      '../../node_modules/.pnpm/node-forge@1.4.0/node_modules/node-forge/lib/asn1.js',
    ]));
    const result = await inspectNativeBundleSourceMaps({ ios, android });
    assert.equal(result.status, 'EXPOSED');
    assert.deepEqual(result.platformEvidence.android.exposedPackages, ['node-forge']);
  });
});

test('B152 fails closed on missing platform source maps', async () => {
  await withBuilds(async ({ ios, android, write }) => {
    await write('ios');
    await writeFile(path.join(android, 'index.js'), 'console.log(1)');
    await assert.rejects(
      () => inspectNativeBundleSourceMaps({ ios, android }),
      /source maps missing/u,
    );
  });
});

test('B152 fails closed on no third-party source attribution', async () => {
  await withBuilds(async ({ ios, android, write }) => {
    await write('ios', sourceMap(['../../apps/mobile/src/Only.tsx']));
    await write('android');
    await assert.rejects(
      () => inspectNativeBundleSourceMaps({ ios, android }),
      /meaningful third-party/u,
    );
  });
});

test('B152 fails closed on invalid JSON, unknown version or empty source list', async () => {
  for (const doc of [
    sourceMap([], {}),
    sourceMap(cleanSources, { version: 2 }),
    sourceMap(cleanSources, { sourceRoot: 123 }),
    sourceMap([null]),
    sourceMap(['%ZZ']),
  ]) {
    assert.throws(() => inspectNativeSourceMapDocument(doc), undefined,
      JSON.stringify(doc).slice(0, 50));
  }
  await withBuilds(async ({ ios, android, write }) => {
    await write('ios');
    await write('android');
    await writeFile(path.join(ios, 'index.js.map'), '{broken json');
    await assert.rejects(() => inspectNativeBundleSourceMaps({ ios, android }));
  });
});

test('B152 rejects symlinks in exported artifact directories', async () => {
  await withBuilds(async ({ temp, ios, android, write }) => {
    await write('ios');
    await write('android');
    await symlink(path.join(ios, 'index.js'), path.join(android, 'rogue.js'));
    await assert.rejects(
      () => inspectNativeBundleSourceMaps({ ios, android }),
      /symlink/u,
    );
  });
});

test('B152 detects nested output bundles without relying on fixed Expo filenames', async () => {
  await withBuilds(async ({ ios, android, write }) => {
    await mkdir(path.join(ios, '_expo', 'static', 'js'), { recursive: true });
    await writeFile(path.join(ios, '_expo', 'static', 'js', 'chunk.js'), 'true;');
    await writeFile(path.join(ios, '_expo', 'static', 'js', 'chunk.js.map'), JSON.stringify(sourceMap()));
    await write('android', sourceMap(), 'runtime.bundle.map');
    await writeFile(path.join(android, 'runtime.bundle'), 'true;');
    const result = await inspectNativeBundleSourceMaps({ ios, android });
    assert.equal(result.status, 'INSPECTED');
    assert.equal(result.platformEvidence.ios.mapFiles, 1);
    assert.equal(result.platformEvidence.android.mapFiles, 1);
  });
});
