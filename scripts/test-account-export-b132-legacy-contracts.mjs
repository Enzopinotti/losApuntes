import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Re-run existing single-process Bxx source and Node regression tests independently.
 * The root pnpm check remains mandatory; this makes multiple stale structural
 * assertions visible together instead of stopping at the first failing script.
 * Only the  configured source guards and standalone local Node tests are run.
 * No external providers, containers, migrations or deploy actions.
 */
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const configured = manifest.scripts['test:account-lifecycle-contract'].split(' && ');
const checks = configured.filter((command) => {
  const value = command.trim();
  return (
    /^node scripts\/test-account-export-b\d+[a-z0-9-]*\.mjs$/u.test(value) ||
    /^node (?:--experimental-strip-types )?(?:--import \.\/scripts\/testing\/register-api-typescript\.mjs )?--test scripts\/test-account-export-b\d+[a-z0-9-]*\.test\.mjs$/u.test(value)
  );
});
assert.ok(checks.length >= 75, 'Unexpectedly few configured Account Export source and Node tests');

const failures = [];
for (const command of checks) {
  const args = command.trim().split(/\s+/u).slice(1);
  const path = args[args.length - 1];
  const execution = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, STUDY_PROGRESS_ENABLED: 'false' },
  });

  if (execution.status === 0 && !execution.error) {
    console.log('PASS', path);
    continue;
  }

  const diagnostic = String(execution.stderr || execution.stdout || execution.error || '')
    .split('\n')
    .filter((line) => /AssertionError|ERR_ASSERTION|at file:|expected:|Assertion failed|SyntaxError|Error:|FAIL/u.test(line))
    .slice(0, 6)
    .map((line) => line.slice(0, 360));
  failures.push({ path, exitCode: execution.status, diagnostic });
  console.error('FAIL', path, JSON.stringify(diagnostic));
}
console.log(JSON.stringify({
  event: 'quality.account_export_legacy_contracts_and_node_tests',
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
}));
assert.equal(failures.length, 0, 'Account Export source contract regressions remain');
