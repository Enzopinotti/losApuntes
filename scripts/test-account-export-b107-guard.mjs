import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const gate = read('scripts/testing/b107-node-gate.mjs');
const tapTest = read('scripts/test-account-export-b107-tap-provenance.test.mjs');
const runtimeTest = read('scripts/test-account-export-b107-runtime.test.mjs');
const originalGuard = read('scripts/test-account-export-b101-guard.mjs');
const suite = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }

check('B107 real signed runner accepts release only in Node24', () => {
  assert.match(runner, /classifyB107SignedHttpRuntime\(nodeMajor, process\.argv\.slice\(2\)\)/u);
  assert.match(gate, /nodeMajor === 24 && argumentsList\.length === 0/u);
  assert.match(gate, /nodeMajor === 22 && argumentsList\.length === 1/u);
  assert.match(gate, /'--diagnostic-node22'/u);
  assert.match(runner, /qualification === 'acceptance'/u);
});

check('B107 Node22 green diagnostics are labeled non-acceptance', () => {
  assert.match(runner, /Node22 signed HTTP diagnostic PASS/u);
  assert.match(runner, /NOT release acceptance \(Node24 required\)/u);
  assert.match(gate, /release acceptance requires Node24/u);
  assert.match(runtimeTest, /Node22 default runner terminates before any API/u);
});

check('B107 parses exact one-to-N TAP plan, ordered test names and PASS indices', () => {
  assert.match(tap, /plans\.length !== 1/u);
  assert.match(tap, /Number\(plans\[0\]\[1\]\) !== expectedNames\.length/u);
  assert.match(tap, /found\.some\(\(name, i\) => name !== expectedNames\[i\]\)/u);
  assert.match(tap, /passing\.some\(\(name, i\) => name !== expectedNames\[i\]\)/u);
  assert.match(tap, /results\.some\(\(m, i\) => Number\(m\[1\]\) !== i \+ 1\)/u);
});

check('B107 TAP never accepts test filters, hidden errors or skipped tests', () => {
  assert.match(tap, /summary\.tests !== expectedNames\.length/u);
  assert.match(tap, /summary\.skipped !== 0/u);
  assert.match(tap, /\^not ok \[0-9\]\+ - /u);
  assert.match(tapTest, /rejects missing, mismatched and duplicate TAP plans/u);
  assert.match(tapTest, /rejects a top-level not-ok hidden/u);
});

check('B107 native unit tests cover synthetic TAP and both Node22/24 policies', () => {
  assert.match(tapTest, /34 ordered distinct top-level cases/u);
  assert.match(tapTest, /out-of-order and nonsequential/u);
  assert.match(runtimeTest, /Node24 with no arguments qualifies/u);
  assert.match(runtimeTest, /STUDY_PROGRESS_ENABLED=true/u);
});

check('B107 still runs all 61 actual distinct local signed tests', () => {
  const names = [...suite.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, names.length);
  assert.match(runner, /expectedNames\.length < 61/u);
  // B121: Node24's default spec output is not TAP; pin the child reporter.
  assert.match(runner, /'--test-reporter=tap'/u);
  assert.match(runner, /verifyB101SignedHttpTap\(/u);
  assert.match(originalGuard, /B101 TAP runner enforces full unskipped results/u);
});

check('B107 exposes separate strict release and diagnostic commands', () => {
  const accept = scripts['test:account-export-b107-release-acceptance'];
  const diagnostic = scripts['test:account-export-signed-http-diagnostic-node22'];
  const contract = scripts['test:account-export-b107-contract'];
  assert.match(accept, /run-account-export-b101-signed-http\.mjs/u);
  assert.doesNotMatch(accept, /--diagnostic-node22/u);
  assert.match(diagnostic, /--diagnostic-node22/u);
  assert.match(contract, /test-account-export-b107-tap-provenance\.test\.mjs/u);
  assert.match(scripts['test:account-lifecycle-contract'], /test-account-export-b107-guard\.mjs/u);
});

check('B107 keeps release #353 HOLD and production Study disabled', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B107/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(runner, /STUDY_PROGRESS_ENABLED === 'true'/u);
});

console.log('B107 Node24 signed S3 acceptance: ' + passed + '/8 guards PASS');
