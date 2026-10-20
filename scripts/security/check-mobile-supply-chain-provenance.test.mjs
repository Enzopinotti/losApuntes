import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectMobileSupplyChainProvenance,
  readPnpm9ProductionGraph,
} from './check-mobile-supply-chain-provenance.mjs';

const fixture = String.raw`lockfileVersion: '9.0'

importers:
  .:
    devDependencies:
      node-forge:
        specifier: 1.4.0
        version: 1.4.0
  apps/api:
    dependencies:
      fastify:
        specifier: 5.0.0
        version: 5.0.0
  apps/web:
    dependencies:
      react:
        specifier: 19.0.0
        version: 19.0.0
  apps/mobile:
    dependencies:
      expo:
        specifier: 57.0.25
        version: 57.0.25
      '@losapuntes/contracts':
        specifier: workspace:*
        version: link:../../packages/contracts
  packages/contracts:
    dependencies:
      zod:
        specifier: 3.0.0
        version: 3.0.0

snapshots:
  fastify@5.0.0: {}
  react@19.0.0: {}
  zod@3.0.0: {}
  expo@57.0.25:
    dependencies:
      '@expo/cli': 57.0.27
      metro: 0.84.5
  '@expo/cli@57.0.27':
    dependencies:
      node-forge: 1.4.0
  metro@0.84.5:
    dependencies:
      micromatch: 4.0.8
  micromatch@4.0.8:
    dependencies:
      braces: 3.0.3
  braces@3.0.3: {}
  node-forge@1.4.0: {}
`;

function inspect(text = fixture) {
  return inspectMobileSupplyChainProvenance(readPnpm9ProductionGraph(text));
}

test('B142 reads pnpm v9 snapshots and isolates both families to Mobile production', () => {
  const result = inspect();
  assert.equal(result.boundaryStatus, 'ISOLATED_TO_MOBILE');
  assert.deepEqual(result.serverExposure, []);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.productionAuditCertified, false);
  assert.deepEqual(result.importerEvidence['apps/api'].packages, {});
  assert.deepEqual(result.importerEvidence['apps/web'].packages, {});
  assert.deepEqual(result.importerEvidence['apps/mobile'].packages['node-forge'], {
    version: '1.4.0',
    path: ['apps/mobile', 'expo@57.0.25', '@expo/cli@57.0.27', 'node-forge@1.4.0'],
  });
  assert.deepEqual(result.importerEvidence['apps/mobile'].packages.braces, {
    version: '3.0.3',
    path: ['apps/mobile', 'expo@57.0.25', 'metro@0.84.5',
      'micromatch@4.0.8', 'braces@3.0.3'],
  });
  assert.equal(result.importerEvidence['apps/mobile'].inspectedNodes, 8);
});

test('B142 excludes root devDependencies from production reachability', () => {
  assert.deepEqual(inspect().importerEvidence['apps/api'].packages, {});
});

test('B142 fails API boundary if previously Mobile-only node-forge leaks into API', () => {
  const poisoned = fixture.replace(
    'fastify@5.0.0: {}',
    "fastify@5.0.0:\n    dependencies:\n      node-forge: 1.4.0",
  );
  const result = inspect(poisoned);
  assert.equal(result.boundaryStatus, 'FAIL');
  assert.deepEqual(result.serverExposure, ['node-forge']);
  assert.deepEqual(result.importerEvidence['apps/api'].packages['node-forge'].path,
    ['apps/api', 'fastify@5.0.0', 'node-forge@1.4.0']);
  assert.equal(result.releaseAuthorized, false);
});

test('B142 follows local workspace production links and fails for Web contamination', () => {
  const poisoned = fixture
    .replace(
      '  apps/web:\n    dependencies:\n      react:',
      '  apps/web:\n    dependencies:\n      contracts:\n        specifier: workspace:*\n        version: link:../../packages/contracts\n      react:',
    )
    .replace(
      '  zod@3.0.0: {}',
      "  zod@3.0.0:\n    dependencies:\n      braces: 3.0.3",
    );
  const result = inspect(poisoned);
  assert.equal(result.boundaryStatus, 'FAIL');
  assert.deepEqual(result.serverExposure, ['braces']);
  assert.deepEqual(result.importerEvidence['apps/web'].packages.braces.path,
    ['apps/web', 'packages/contracts', 'zod@3.0.0', 'braces@3.0.3']);
});

test('B142 new versions are detected by name, never a vulnerable version allowlist', () => {
  const changed = fixture.replaceAll('1.4.0', '1.9.9');
  const result = inspect(changed);
  assert.equal(result.importerEvidence['apps/mobile'].packages['node-forge'].version, '1.9.9');
  assert.equal(result.productionAuditCertified, false);
});

test('B142 unrelated similar names do not masquerade as exact monitored packages', () => {
  const changed = fixture
    .replaceAll('node-forge', 'node-forge-helper')
    .replaceAll('braces', 'braces-helper');
  const result = inspect(changed);
  assert.deepEqual(result.importerEvidence['apps/mobile'].packages, {});
});

test('B142 unsupported, missing and malformed lock evidence fail closed', () => {
  const invalid = [
    fixture.replace("lockfileVersion: '9.0'", "lockfileVersion: '8.0'"),
    fixture.replace('  node-forge@1.4.0: {}', ''),
    fixture.replace('  apps/api:', '  apps/api-deleted:'),
    fixture.replace('  react@19.0.0: {}', ''),
    fixture.replace('link:../../packages/contracts', 'link:../../../../outside'),
    fixture.replace('link:../../packages/contracts', 'workspace:unresolved'),
    fixture.replace('  metro@0.84.5:', '  metro@not-a-version:'),
    fixture.replace('    dependencies:\n      fastify:', '    dependencies:\n      fastify:\n        version: 5.0.0'),
  ];
  for (const source of invalid) {
    assert.throws(() => inspect(source), undefined, source.slice(0, 80));
  }
});

test('B142 cyclic snapshot references terminate with bounded walk', () => {
  const cyclic = fixture.replace(
    '  node-forge@1.4.0: {}',
    "  node-forge@1.4.0:\n    dependencies:\n      expo: 57.0.25",
  );
  const result = inspect(cyclic);
  assert.equal(result.boundaryStatus, 'ISOLATED_TO_MOBILE');
  assert.equal(result.productionAuditCertified, false);
});

test('B142 nested peer keys are represented as normal graph snapshots', () => {
  const withPeer = fixture
    .replaceAll('57.0.25', '57.0.25(react@19.0.0)');
  const result = inspect(withPeer);
  assert.equal(result.boundaryStatus, 'ISOLATED_TO_MOBILE');
  assert.equal(result.importerEvidence['apps/mobile'].packages.braces.version, '3.0.3');
});
