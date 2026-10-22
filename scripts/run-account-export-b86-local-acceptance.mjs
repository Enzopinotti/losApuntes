#!/usr/bin/env node
/**
 * B86 explicit, opt-in local acceptance. Never treat skipped Mongo specs as
 * passing tests. This command refuses production connections and will not
 * start containers, contact a remote S3 endpoint, or change feature flags.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateB89LocalMongoUri } from './testing/b89-local-mongo-uri.mjs';
import {
  B94_MONGO_TEST_PATH,
  B94_MONGO_TEST_PATTERN,
  validateB94MongoAcceptanceSource,
  verifyB94MongoAcceptanceReport,
} from './testing/b94-mongo-acceptance-plan.mjs';

const uri = process.env.STUDY_PROGRESS_TEST_MONGO_URI;
if (!uri) {
  console.error('B86 requires STUDY_PROGRESS_TEST_MONGO_URI with an isolated local replica set.');
  process.exit(2);
}
let safeUri;
try {
  safeUri = await validateB89LocalMongoUri(uri);
} catch {
  // Never echo connection strings or credentials to logs.
  console.error('B89 rejected Mongo URI: use an uncredentialed 127.0.0.1/localhost replica set, with a loopback DNS resolution and no extra connection options.');
  process.exit(2);
}
if (process.env.STUDY_PROGRESS_ENABLED === 'true') {
  console.error('B86 requires STUDY_PROGRESS_ENABLED=false; no production rollout.');
  process.exit(2);
}
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('B86 acceptance requires project Node 24; do not treat Node 22 as acceptance.');
  process.exit(2);
}
// Fail before spawning Jest if a protected scenario was renamed or removed.
// Test sources are resolved relative to this checked-in script, never to an
// operator-supplied path; no untrusted project checkout is accepted.
try {
  validateB94MongoAcceptanceSource(readFileSync(
    fileURLToPath(new URL('../apps/api/' + B94_MONGO_TEST_PATH, import.meta.url)),
    'utf8',
  ));
} catch {
  console.error('B94 rejected acceptance: B86/B90/B93 test inventory missing or changed.');
  process.exit(2);
}

const outputDirectory = mkdtempSync(join(tmpdir(), 'losapuntes-b94-'));
const reportPath = join(outputDirectory, 'jest-results.json');
try {
  const args = [
    '--filter', '@losapuntes/api', 'test:ci',
    '--runTestsByPath', B94_MONGO_TEST_PATH,
    '--testNamePattern', B94_MONGO_TEST_PATTERN,
    '--passWithNoTests=false',
    '--json', '--outputFile', reportPath,
  ];
  console.log(
    'B94 verified loopback Mongo acceptance: all 5 B86/B90/B93 cases; ' +
    'S3 is mocked over HTTP transport. No remote DB/S3.',
  );
  const run = spawnSync('pnpm', args, {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      STUDY_PROGRESS_ENABLED: 'false',
      STUDY_PROGRESS_TEST_MONGO_URI: safeUri,
    },
  });
  if (run.error || run.status !== 0) {
    // Do not turn a missing runner, signal or failed Jest process into PASS.
    console.error('B94 acceptance Jest failed or could not start.');
    process.exitCode = run.status && run.status > 0 ? run.status : 2;
  } else {
    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const result = verifyB94MongoAcceptanceReport(report);
      console.log(
        'B94 local Mongo/S3 acceptance PASS: ' + result.passed +
        '/' + result.required + ' mandatory cases executed.',
      );
    } catch {
      // Critical: even Jest exit 0 is a FAIL if the selected assertions
      // are skipped, missing, duplicated, renamed or the report is absent.
      console.error('B94 rejected Jest exit 0: no proof of all 5 required PASS cases.');
      process.exitCode = 2;
    }
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
