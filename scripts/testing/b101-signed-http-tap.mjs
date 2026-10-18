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
  // Node's TAP summary can be copied, truncated or paired with a filtered
  // execution. Verify the single top-level plan as well as the summary.
  const plans = [...stdout.matchAll(/^1\.\.([0-9]+)$/gm)];
  if (!/^TAP version 13\s/mu.test(stdout) ||
      plans.length !== 1 ||
      Number(plans[0][1]) !== expectedNames.length) {
    throw new Error('B107 signed HTTP TAP lacks an exact top-level plan');
  }
  if (/^not ok [0-9]+ - /mu.test(stdout)) {
    throw new Error('B107 signed HTTP TAP has a failing top-level result');
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
      expectedNames.some(name => !found.includes(name)) ||
      found.some((name, i) => name !== expectedNames[i])) {
    throw new Error('B107 signed HTTP TAP is missing an ordered required subtest');
  }
  const results = [...stdout.matchAll(/^ok ([0-9]+) - (.+)$/gm)];
  const passing = results.map(m => m[2].trim());
  if (passing.length !== expectedNames.length ||
      new Set(passing).size !== passing.length ||
      expectedNames.some(name => !passing.includes(name)) ||
      passing.some((name, i) => name !== expectedNames[i]) ||
      results.some((m, i) => Number(m[1]) !== i + 1)) {
    throw new Error('B107 signed HTTP lacks ordered and numbered PASS evidence');
  }
  return { passed: summary.pass, expected: expectedNames.length };
}
