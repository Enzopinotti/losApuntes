#!/usr/bin/env node
/**
 * B86 explicit, opt-in local acceptance. Never treat skipped Mongo specs as
 * passing tests. This command refuses production connections and will not
 * start containers, contact a remote S3 endpoint, or change feature flags.
 */
import { spawnSync } from 'node:child_process';
import { validateB89LocalMongoUri } from './testing/b89-local-mongo-uri.mjs';

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
const args = [
  '--filter', '@losapuntes/api', 'test:ci',
  '--runTestsByPath', 'src/study-progress/mongo/study-progress.mongo-int.spec.ts',
  '--testNamePattern', 'B86',
  '--passWithNoTests=false',
];
console.log('B86/B89 verified loopback replica + real app S3 adapter (mocked HTTP transport). No remote DB/S3.');
const run = spawnSync('pnpm', args, {
  stdio: 'inherit', shell: false,
  env: {
    ...process.env,
    STUDY_PROGRESS_ENABLED: 'false',
    STUDY_PROGRESS_TEST_MONGO_URI: safeUri,
  },
});
if (run.error) {
  console.error('B86 could not start pnpm:', run.error.message);
  process.exit(2);
}
process.exit(run.status ?? 2);
