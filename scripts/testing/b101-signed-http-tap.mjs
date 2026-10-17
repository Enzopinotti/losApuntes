/**
 * Fail-closed acceptance of Node's TAP output for the signed S3 HTTP suite.
 * Exit 0 alone is not proof: filters, skipped tests or missing subtests can
 * leave a green command while private export safety cases never executed.
 */
function readCount(tap, key) {
  const matches = [...tap.matchAll(new RegExp('^# ' + key + ' ([0-9]+)$', 'gm'))];
  if (matches.length !== 1) return null;
  return Number(matches[0][1]);
}

export function verifyB101SignedHttpTap(input) {
  const { stdout, exitCode, expectedNames } = input;
  if (exitCode !== 0 || typeof stdout !== 'string' ||
      !Array.isArray(expectedNames) || expectedNames.length < 22 ||
      new Set(expectedNames).size !== expectedNames.length) {
    throw new Error('B101 signed HTTP did not execute a complete expected test inventory');
  }
  const summary = Object.fromEntries(
    ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
      .map(key => [key, readCount(stdout, key)]),
  );
  if (summary.tests !== expectedNames.length ||
      summary.pass !== expectedNames.length ||
      summary.fail !== 0 || summary.cancelled !== 0 ||
      summary.skipped !== 0 || summary.todo !== 0) {
    throw new Error('B101 signed HTTP TAP reports failures, skips or missing cases');
  }
  const found = [...stdout.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1].trim());
  if (found.length !== expectedNames.length ||
      new Set(found).size !== found.length ||
      expectedNames.some(name => !found.includes(name))) {
    throw new Error('B101 signed HTTP TAP is missing a required subtest');
  }
  const passing = [...stdout.matchAll(/^ok [0-9]+ - (.+)$/gm)].map(m => m[1].trim());
  if (passing.length !== expectedNames.length ||
      new Set(passing).size !== passing.length ||
      expectedNames.some(name => !passing.includes(name))) {
    throw new Error('B101 signed HTTP lacks evidence for each individual PASS');
  }
  return { passed: summary.pass, expected: expectedNames.length };
}
