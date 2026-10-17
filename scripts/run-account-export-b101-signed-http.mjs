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

if (process.env.STUDY_PROGRESS_ENABLED === 'true') {
  console.error('B101 cannot execute with STUDY_PROGRESS_ENABLED=true.');
  process.exit(2);
}
const testUrl = new URL('./test-account-export-b86-s3-loopback.test.mjs', import.meta.url);
const testSource = readFileSync(testUrl, 'utf8');
const expectedNames = [...testSource.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
const required = ['B86 ', 'B87 ', 'B95 ', 'B96 ', 'B97 ', 'B99 ',
  'B100 ', 'B101 ', 'B102 ', 'B103 ', 'B104 ', 'B105 ', 'B106 '];
if (expectedNames.length < 34 ||
    required.some(prefix => !expectedNames.some(name => name.startsWith(prefix))) ||
    !testSource.includes("server.listen(0, '127.0.0.1', resolve)") ||
    !testSource.includes('verifyB87S3SigV4({')) {
  console.error('B101 rejected: signed loopback test inventory or signature checks missing.');
  process.exit(2);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (![22, 24].includes(nodeMajor)) {
  console.error('B101 requires Node22 diagnostic or Node24 acceptance.');
  process.exit(2);
}
const run = spawnSync(process.execPath, [
  '--experimental-strip-types',
  '--import', fileURLToPath(new URL('./testing/register-api-typescript.mjs', import.meta.url)),
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
  if (nodeMajor === 24) {
    console.log('B105 Node24 local signed HTTP PASS: ' + result.passed + '/' + result.expected);
  } else {
    console.log('B105 Node22 signed HTTP diagnostic PASS: ' + result.passed +
      '/' + result.expected + '; NOT release acceptance (Node24 required).');
  }
} catch {
  console.error('B105 signed HTTP failed: no complete, unskipped local TAP acceptance.');
  process.exitCode = 2;
}
