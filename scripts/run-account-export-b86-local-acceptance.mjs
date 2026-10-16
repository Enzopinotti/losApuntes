#!/usr/bin/env node
/**
 * B86 explicit, opt-in local acceptance. Never treat skipped Mongo specs as
 * passing tests. This command refuses production connections and will not
 * start containers, contact a remote S3 endpoint, or change feature flags.
 */
import { spawnSync } from 'node:child_process';

const uri = process.env.STUDY_PROGRESS_TEST_MONGO_URI;
if (!uri) {
  console.error('B86 requires STUDY_PROGRESS_TEST_MONGO_URI with an isolated local replica set.');
  process.exit(2);
}
let parsed;
try {
  parsed = new URL(uri);
} catch {
  console.error('B86 rejects an invalid Mongo URI.');
  process.exit(2);
}
if (
  parsed.protocol !== 'mongodb:' ||
  !['127.0.0.1', 'localhost', 'mongo'].includes(parsed.hostname) ||
  parsed.username || parsed.password ||
  !parsed.searchParams.get('replicaSet') ||
  parsed.hash ||
  parsed.port && (!/^\d+$/u.test(parsed.port) ||
    Number(parsed.port) < 1 || Number(parsed.port) > 65535)
) {
  console.error('B86 accepts only a local, uncredentialed Mongo replica set.');
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
const args = [
  '--filter', '@losapuntes/api', 'test:ci',
  '--runTestsByPath', 'src/study-progress/mongo/study-progress.mongo-int.spec.ts',
  '--testNamePattern', 'B86',
  '--passWithNoTests=false',
];
console.log('B86 local replica + real app S3 adapter (mocked HTTP transport). No external S3 calls.');
const run = spawnSync('pnpm', args, {
  stdio: 'inherit', shell: false,
  env: { ...process.env, STUDY_PROGRESS_ENABLED: 'false' },
});
if (run.error) {
  console.error('B86 could not start pnpm:', run.error.message);
  process.exit(2);
}
process.exit(run.status ?? 2);
