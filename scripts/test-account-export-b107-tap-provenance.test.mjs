import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyB101SignedHttpTap as verify } from './testing/b101-signed-http-tap.mjs';

// Simulates the exact top-level shape of a Node --test TAP transcript.
// The B101/B107 verifier is pure JS, so this suite also runs on Node22.
const names = Array.from({ length: 34 }, (_, i) => 'B107 signed scenario ' + (i + 1));
const transcript = (testNames = names) => [
  'TAP version 13',
  ...testNames.flatMap((name, i) => [
    '# Subtest: ' + name,
    'ok ' + (i + 1) + ' - ' + name,
  ]),
  '1..' + testNames.length,
  '# tests ' + testNames.length,
  '# suites 0',
  '# pass ' + testNames.length,
  '# fail 0', '# cancelled 0', '# skipped 0', '# todo 0',
].join('\n') + '\n';
const confirm = stdout => verify({ stdout, exitCode: 0, expectedNames: names });

test('B107 validates 34 ordered distinct top-level cases and their plan', () => {
  assert.deepEqual(confirm(transcript()), { passed: 34, expected: 34 });
});

test('B107 rejects missing, mismatched and duplicate TAP plans despite 34 PASS summary', () => {
  for (const invalid of [
    transcript().replace('1..34\n', ''),
    transcript().replace('1..34\n', '1..33\n'),
    transcript().replace('1..34\n', '1..34\n1..34\n'),
    transcript().replace('TAP version 13\n', ''),
  ]) assert.throws(() => confirm(invalid));
});

test('B107 rejects duplicate, out-of-order and nonsequential TAP PASS indices', () => {
  const valid = transcript();
  for (const invalid of [
    valid.replace('ok 2 - ', 'ok 1 - '),
    valid.replace('ok 3 - ', 'ok 35 - '),
    valid.replace('ok 2 - ' + names[1], 'ok 3 - ' + names[1])
      .replace('ok 3 - ' + names[2], 'ok 2 - ' + names[2]),
  ]) assert.throws(() => confirm(invalid));
});

test('B107 rejects shuffled PASS names even if counts and name sets match', () => {
  const good = transcript();
  const swapped = good
    .replace('ok 2 - ' + names[1], 'ok 2 - PLACEHOLDER_B107')
    .replace('ok 3 - ' + names[2], 'ok 3 - ' + names[1])
    .replace('ok 2 - PLACEHOLDER_B107', 'ok 2 - ' + names[2]);
  assert.throws(() => confirm(swapped));
});

test('B107 rejects shuffled subtest names with plausible PASS and summary', () => {
  const good = transcript();
  const swapped = good
    .replace('# Subtest: ' + names[1], '# Subtest: PLACEHOLDER_B107')
    .replace('# Subtest: ' + names[2], '# Subtest: ' + names[1])
    .replace('# Subtest: PLACEHOLDER_B107', '# Subtest: ' + names[2]);
  assert.throws(() => confirm(swapped));
});

test('B107 rejects a top-level not-ok hidden behind a synthetic green summary', () => {
  assert.throws(() => confirm(transcript() + 'not ok 35 - hidden failure\n'));
});

test('B107 rejects skips, TODO, duplicate inventory, and nonzero process exit', () => {
  assert.throws(() => confirm(transcript().replace('# skipped 0', '# skipped 1')));
  assert.throws(() => confirm(transcript().replace('# todo 0', '# todo 1')));
  assert.throws(() => verify({
    stdout: transcript(), exitCode: 1, expectedNames: names,
  }));
  assert.throws(() => verify({
    stdout: transcript(), exitCode: 0, expectedNames: names.map(() => 'duplicate'),
  }));
});

test('B107 rejects missing and extra case rows despite an unchanged summary', () => {
  assert.throws(() => confirm(transcript().replace('# Subtest: ' + names[2] + '\n', '')));
  assert.throws(() => confirm(transcript().replace('ok 3 - ' + names[2] + '\n', '')));
  assert.throws(() => confirm(transcript() + 'ok 35 - unexpected\n'));
});
