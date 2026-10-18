import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runner = read('scripts/run-account-export-b118-local-proof.mjs');
const contract = read('scripts/testing/b118-proof-contract.mjs');
const native = read('scripts/test-account-export-b118-proof-contract.test.mjs');
const signed = read('scripts/run-account-export-b101-signed-http.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('PASS ' + label); };

check('B118 binds local proof to strict expected Git SHA and clean worktree', () => {
  assert.match(runner, /--expected-sha=\[a-f0-9\]\{40\}/u);
  assert.match(runner, /gitHead\(\)/u);
  assert.match(runner, /worktree\(\)/u);
  assert.match(contract, /currentSha !== input\.expectedSha/u);
  assert.match(contract, /gitPorcelain !== ''/u);
});

check('B118 release runtime demands Node24 and exact pnpm9', () => {
  assert.match(contract, /\^24\\\./u);
  assert.match(contract, /pnpmVersion !== '9\.15\.9'/u);
  assert.match(runner, /command\('pnpm', \['--version'\]\)/u);
  assert.match(native, /Node24\/pnpm9 qualify/u);
});

check('B118 executes existing signed HTTP runner with unfiltered subprocess', () => {
  assert.match(runner, /run-account-export-b101-signed-http\.mjs/u);
  assert.match(runner, /spawnSync\(process\.execPath/u);
  assert.doesNotMatch(runner, /'--test-name-pattern'/u);
  assert.match(signed, /verifyB101SignedHttpTap\(/u);
});

check('B118 does not attest fake TAP or a Node22 diagnostic', () => {
  assert.match(contract, /B107 Node24 qualified signed HTTP PASS/u);
  assert.match(contract, /markers\.length !== 1/u);
  assert.match(contract, /markers\[0\]\[1\] !== '61'/u);
  assert.match(native, /Node22 signed HTTP diagnostic PASS/u);
  assert.match(native, /B118 never treats failed or incomplete/u);
});

check('B118 rechecks HEAD, worktree and source hashes after executing tests', () => {
  assert.match(runner, /currentSha: gitHead\(\)/u);
  assert.match(runner, /gitPorcelain: worktree\(\)/u);
  assert.match(runner, /source changed during execution/u);
  assert.match(runner, /inventorySha256/u);
  assert.match(runner, /runnerSha256/u);
});

check('B118 minimal evidence does not contain TAP output or private bytes', () => {
  assert.match(contract, /tapSha256: input\.tapSha256/u);
  assert.match(contract, /releaseGate: 'HOLD'/u);
  assert.match(native, /Object\.hasOwn\(value, 'stdout'\), false/u);
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\)/u);
  assert.match(runner, /mode: 0o600/u);
});

check('B118 lifecycle exposes safe unit/guard checks but not automatic acceptance', () => {
  assert.match(pkg['test:account-export-b118-contract'], /test-account-export-b118-proof-contract\.test\.mjs/u);
  assert.match(pkg['test:account-export-b118-contract'], /test-account-export-b118-guard\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b118-guard\.mjs/u);
  assert.doesNotMatch(pkg['test:account-lifecycle-contract'], /run-account-export-b118-local-proof\.mjs/u);
});

check('B118 keeps Study Progress blocked and the issue #353 on HOLD', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B118/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B118 exact-head signed HTTP proof: ' + passed + '/8 guards PASS');
