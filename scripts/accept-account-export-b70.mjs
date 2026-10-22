#!/usr/bin/env node
/**
 * B70: local-only, exact-head export acceptance runner.
 * No CI, no production services and no S3 credentials are required.
 * Real S3/provider and HTTP E2E qualification remain separate release gates.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [flag, expectedSha, ...extra] = process.argv.slice(2);
const accepted = /^[0-9a-f]{40}$/u;
const safeHosts = new Set(['127.0.0.1', 'localhost', 'mongo']);

function fail(message) {
  console.error('B70 local acceptance refused: ' + message);
  process.exitCode = 2;
}

function command(cmd, args, mode = 'pipe') {
  const response = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: mode === 'inherit' ? 'inherit' : 'pipe',
    env: process.env,
    timeout: 5 * 60 * 1000,
  });
  if (response.error) throw response.error;
  return response;
}

if (flag !== '--expected-sha' || !accepted.test(expectedSha || '') ||
    extra.length !== 0) {
  fail('use --expected-sha followed by the exact 40-character main commit');
} else if (Number(process.versions.node.split('.')[0]) !== 24) {
  fail('Node.js 24 is required by this repository');
} else {
  let steps = [];
  let sha;
  let pnpmVersion;
  let refusal = null;
  try {
    const head = command('git', ['rev-parse', 'HEAD']);
    sha = head.stdout.trim();
    const status = command('git', ['status', '--porcelain']);
    if (head.status !== 0 || sha !== expectedSha) {
      throw new Error('Checkout HEAD does not match --expected-sha');
    }
    if (status.status !== 0 || status.stdout.trim()) {
      throw new Error('Checkout is not clean; acceptance must use exact committed sources');
    }
    const pnpm = command('pnpm', ['--version']);
    pnpmVersion = pnpm.stdout.trim();
    if (pnpm.status !== 0 || pnpmVersion !== '9.15.9') {
      throw new Error('pnpm 9.15.9 is required');
    }
    const mongoUri = process.env.STUDY_PROGRESS_TEST_MONGO_URI;
    if (!mongoUri) {
      throw new Error('STUDY_PROGRESS_TEST_MONGO_URI must explicitly opt into local Mongo replica set');
    }
    const mongo = new URL(mongoUri);
    if (mongo.protocol !== 'mongodb:' || !safeHosts.has(mongo.hostname) ||
        mongo.username || mongo.password || !mongo.searchParams.get('replicaSet')) {
      throw new Error('Only a local, uncredentialed Mongo replica-set URI is permitted');
    }
    // The Mongo test suite additionally verifies the entire local topology
    // and creates/drops only a randomized isolated acceptance database.
    const stages = [
      {
        name: 'api-types',
        args: ['--filter', '@losapuntes/api', 'check:types'],
      },
      {
        name: 'api-export-jest',
        args: [
          '--filter', '@losapuntes/api', 'exec', 'jest',
          '--runInBand', '--runTestsByPath',
          'src/data-lifecycle/domain/account-export-processor.spec.ts',
          'src/data-lifecycle/domain/account-export-assembler.spec.ts',
          'src/data-lifecycle/storage/account-export-artifact-storage.spec.ts',
          'src/data-lifecycle/mongo/mongo-account-export.store.spec.ts',
          'src/data-lifecycle/mongo/mongo-account-export-orphan-cleanup.store.spec.ts',
        ],
      },
      {
        name: 'account-export-contract',
        args: ['test:account-lifecycle-contract'],
      },
      {
        name: 'mongo-replica-acceptance',
        args: [
          '--filter', '@losapuntes/api', 'exec', 'jest',
          '--runInBand', '--runTestsByPath',
          'src/study-progress/mongo/study-progress.mongo-int.spec.ts',
        ],
      },
    ];
    for (const stage of stages) {
      const startedAt = new Date().toISOString();
      console.log('B70 running ' + stage.name + ' on ' + sha.slice(0, 12));
      const outcome = command('pnpm', stage.args, 'inherit');
      steps.push({
        name: stage.name,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: outcome.status === 0 ? 'PASS' : 'FAIL',
        exitCode: outcome.status,
        signal: outcome.signal || null,
      });
      if (outcome.status !== 0) break;
    }
  } catch (error) {
    refusal = error instanceof Error ? error.message : 'Unknown failure';
  }
  const passed = !refusal && steps.length === 4 &&
    steps.every((stage) => stage.status === 'PASS');
  const evidence = {
    schema: 'losapuntes.account-export.b70-local-acceptance.v1',
    expectedSha,
    checkedSha: sha || null,
    recordedAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    pnpmVersion: pnpmVersion || null,
    steps,
    localMongoOptIn: Boolean(process.env.STUDY_PROGRESS_TEST_MONGO_URI),
    localAcceptance: passed ? 'PASS' : 'FAIL',
    refusal,
    actualS3ProviderAcceptance: 'NOT_RUN',
    httpBrowserAcceptance: 'NOT_RUN',
    productionRelease: 'HOLD',
  };
  // Never write URIs, credentials, user data or environment contents.
  const destination = join(tmpdir(), 'losapuntes-export-b70-' + expectedSha + '.json');
  writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
  console.log('B70 evidence: ' + destination);
  if (!passed) {
    console.error('B70 local acceptance not passed; production remains HOLD.');
    process.exitCode = 1;
  } else {
    console.log('B70 local checks PASS. Real S3/HTTP/release gates remain unapproved.');
  }
}
