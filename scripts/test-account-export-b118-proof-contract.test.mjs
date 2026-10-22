import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertB118ProofPreconditions as preflight,
  assertB118SignedHttpResult as result,
  buildB118ProofRecord as record,
} from './testing/b118-proof-contract.mjs';

const sha = 'a'.repeat(40);
const hex = 'b'.repeat(64);
const names = [
  ...Array.from({ length: 53 }, (_, i) => 'B86 existing ' + i),
  ...Array.from({ length: 4 }, (_, i) => 'B117 signed HEAD ' + i),
  ...Array.from({ length: 2 }, (_, i) => 'B119 signed HEAD ETag ' + i),
  ...Array.from({ length: 2 }, (_, i) => 'B120 signed DELETE ' + i),
];
const base = {
  expectedSha: sha, currentSha: sha, gitPorcelain: '',
  nodeVersion: '24.5.0', pnpmVersion: '9.15.9',
  studyProgressEnabled: 'false', testNames: names,
  exitCode: 0, signal: null,
  stdout: 'TAP version 13\nB107 Node24 qualified signed HTTP PASS: 61/61\n',
  inventorySha256: hex, runnerSha256: hex, tapSha256: hex,
};

test('B118 only exact clean HEAD and Node24/pnpm9 qualify', () => {
  assert.doesNotThrow(() => preflight(base));
  for (const update of [
    { currentSha: 'c'.repeat(40) }, { expectedSha: 'main' },
    { gitPorcelain: ' M apps/api/src/files/storage/s3-object-storage.ts' },
    { nodeVersion: '22.16.0' }, { nodeVersion: '25.0.0' },
    { pnpmVersion: '10.0.0' }, { studyProgressEnabled: 'true' },
  ]) assert.throws(() => preflight({ ...base, ...update }));
});

test('B118 rejects incomplete, duplicated and manipulated signed inventory', () => {
  for (const testNames of [
    names.slice(0, 60), [...names.slice(0, 60), names[0]],
    names.map(n => n.replace('B117', 'B118')),
  ]) assert.throws(() => preflight({ ...base, testNames }), /61 unique/u);
});

test('B118 never treats failed or incomplete TAP wrapper as successful proof', () => {
  assert.doesNotThrow(() => result(base));
  for (const update of [
    { exitCode: 1 }, { signal: 'SIGTERM' }, { stdout: '' },
    { stdout: 'B107 Node22 signed HTTP diagnostic PASS: 61/61' },
    { stdout: 'B107 Node24 qualified signed HTTP PASS: 60/61' },
    { stdout: base.stdout + base.stdout },
  ]) assert.throws(() => result({ ...base, ...update }));
});

test('B118 evidence is minimal, hash-bound and keeps launch HOLD', () => {
  const value = record(base);
  assert.equal(value.gitSha, sha);
  assert.equal(value.total, 61);
  assert.equal(value.passed, 61);
  assert.equal(value.releaseGate, 'HOLD');
  assert.equal(value.studyProgressProductionEnabled, false);
  assert.equal(value.tapSha256, hex);
  assert.equal(Object.hasOwn(value, 'stdout'), false);
  assert.equal(Object.hasOwn(value, 'testNames'), false);
  assert.throws(() => record({ ...base, tapSha256: 'not-sha' }), /SHA256/u);
});
