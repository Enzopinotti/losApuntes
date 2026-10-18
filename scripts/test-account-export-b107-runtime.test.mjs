import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { classifyB107SignedHttpRuntime as classify } from './testing/b107-node-gate.mjs';

test('B107 only Node24 with no arguments qualifies as release acceptance', () => {
  assert.equal(classify(24, []), 'acceptance');
  for (const major of [18, 20, 21, 22, 23, 25, NaN]) {
    assert.throws(() => classify(major, []), /requires Node24/u);
  }
});

test('B107 Node22 needs an explicit diagnostic opt-in and never qualifies', () => {
  assert.equal(classify(22, ['--diagnostic-node22']), 'diagnostic');
  for (const args of [[], ['--release'], ['--diagnostic-node22', '--release'],
    ['--diagnostic-node22', '--diagnostic-node22'], ['--require-node24']]) {
    assert.throws(() => classify(22, args), /requires Node24/u);
  }
});

test('B107 Node24 rejects misleading diagnostic and unknown CLI options', () => {
  for (const args of [
    ['--diagnostic-node22'], ['--help'], ['--'], ['--test-name-pattern=none'],
  ]) assert.throws(() => classify(24, args), /requires Node24/u);
  assert.throws(() => classify(24, [null]));
});

test('B107 Node22 default runner terminates before any API/network test', {
  skip: Number(process.versions.node.split('.')[0]) !== 22,
}, () => {
  const runner = new URL('./run-account-export-b101-signed-http.mjs', import.meta.url);
  const started = spawnSync(process.execPath, [fileURLToPath(runner)], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, STUDY_PROGRESS_ENABLED: 'false' },
  });
  assert.equal(started.status, 2, started.stderr);
  assert.match(started.stderr, /requires Node24/u);
  assert.doesNotMatch(started.stdout, /TAP version 13/u,
    'runner must deny Node22 before spawning any S3 tests');
});

test('B107 release runner still refuses STUDY_PROGRESS_ENABLED=true', {
  skip: Number(process.versions.node.split('.')[0]) !== 22,
}, () => {
  const runner = new URL('./run-account-export-b101-signed-http.mjs', import.meta.url);
  const started = spawnSync(process.execPath, [fileURLToPath(runner)], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, STUDY_PROGRESS_ENABLED: 'true' },
  });
  assert.equal(started.status, 2, started.stderr);
  assert.match(started.stderr, /STUDY_PROGRESS_ENABLED=true/u);
});
