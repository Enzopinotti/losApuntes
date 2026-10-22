#!/usr/bin/env node
/**
 * Execute the REAL app S3 adapter against the B86/B101 signed localhost HTTP
 * fixture. No Mongo, cloud credentials, remote S3, production flags or CI.
 * Node24 remains the release-qualification engine; Node22 is diagnostic only.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyB101SignedHttpTap } from './testing/b101-signed-http-tap.mjs';
import { classifyB107SignedHttpRuntime } from './testing/b107-node-gate.mjs';

if (process.env.STUDY_PROGRESS_ENABLED === 'true') {
  console.error('B101 cannot execute with STUDY_PROGRESS_ENABLED=true.');
  process.exit(2);
}
const testUrl = new URL('./test-account-export-b86-s3-loopback.test.mjs', import.meta.url);
const testSource = readFileSync(testUrl, 'utf8');
const expectedNames = [...testSource.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
const required = ['B86 ', 'B87 ', 'B95 ', 'B96 ', 'B97 ', 'B99 ',
  'B100 ', 'B101 ', 'B102 ', 'B103 ', 'B104 ', 'B105 ', 'B106 ', 'B108 ', 'B109 ', 'B110 ', 'B111 ', 'B112 ', 'B113 ', 'B114 ', 'B115 ', 'B117 ', 'B119 ', 'B120 '];
if (expectedNames.length < 61 ||
    required.some(prefix => !expectedNames.some(name => name.startsWith(prefix))) ||
    !testSource.includes("server.listen(0, '127.0.0.1', resolve)") ||
    !testSource.includes('verifyB87S3SigV4({')) {
  console.error('B101 rejected: signed loopback test inventory or signature checks missing.');
  process.exit(2);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
let qualification;
try {
  qualification = classifyB107SignedHttpRuntime(nodeMajor, process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const run = spawnSync(process.execPath, [
  '--experimental-strip-types',
  '--import', fileURLToPath(new URL('./testing/register-api-typescript.mjs', import.meta.url)),
  // Node24 defaults to the human-readable spec reporter in this environment;
  // B101's fail-closed verifier requires machine-checkable TAP v13.
  '--test-reporter=tap',
  '--test', fileURLToPath(testUrl),
], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  timeout: 120_000,
  env: { ...process.env, STUDY_PROGRESS_ENABLED: 'false' },
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
try {
  const result = verifyB101SignedHttpTap({
    stdout: run.stdout,
    exitCode: run.error || run.signal ? -1 : run.status,
    expectedNames,
  });
  if (qualification === 'acceptance') {
    console.log('B107 Node24 qualified signed HTTP PASS: ' + result.passed + '/' + result.expected);
  } else {
    console.log('B107 Node22 signed HTTP diagnostic PASS: ' + result.passed +
      '/' + result.expected + '; NOT release acceptance (Node24 required).');
  }
} catch {
  console.error('B107 signed HTTP failed: no complete, unskipped local TAP acceptance.');
  process.exitCode = 2;
}
