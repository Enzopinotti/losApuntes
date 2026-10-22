#!/usr/bin/env node
/**
 * B118 local, read-only execution proof. No CI dispatch, deploy, Mongo,
 * S3 cloud credentials, account data, production flags or git mutation.
 * The existing B107 runner remains the authority for complete signed TAP.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertB118ProofPreconditions,
  assertB118SignedHttpResult,
  buildB118ProofRecord,
} from './testing/b118-proof-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const expectedArg = process.argv.slice(2);
if (expectedArg.length !== 1 ||
    !/^--expected-sha=[a-f0-9]{40}$/u.test(expectedArg[0])) {
  console.error('B118 usage: node scripts/run-account-export-b118-local-proof.mjs --expected-sha=<40-hex-Git-SHA>');
  process.exit(2);
}
const expectedSha = expectedArg[0].slice('--expected-sha='.length);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');

function command(program, args, timeout = 20_000) {
  // Windows does not execute pnpm.cmd directly consistently across Node versions.
  // All arguments here are static or validated lowercase hex; no untrusted shell
  // text, environment interpolation or remote URLs are involved.
  const isWindowsPnpm = process.platform === 'win32' && program === 'pnpm';
  const executable = isWindowsPnpm ? 'cmd.exe' : program;
  const argv = isWindowsPnpm ? ['/d', '/s', '/c', 'pnpm', ...args] : args;
  const outcome = spawnSync(executable, argv, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, STUDY_PROGRESS_ENABLED: 'false' },
    windowsHide: true,
  });
  if (outcome.error || outcome.status !== 0 || outcome.signal !== null) {
    throw new Error('B118 command failed: ' + program + ' ' + args[0]);
  }
  return outcome.stdout.trimEnd();
}
function gitHead() { return command('git', ['rev-parse', 'HEAD']); }
function worktree() { return command('git', ['status', '--porcelain=v1', '--untracked-files=all']); }

try {
  // Do not overwrite an explicitly enabled flag via the subprocess env.
  if (process.env.STUDY_PROGRESS_ENABLED === 'true') {
    throw new Error('B118 refuses STUDY_PROGRESS_ENABLED=true');
  }
  const pnpmVersion = command('pnpm', ['--version']);
  const suite = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
  const runner = read('scripts/run-account-export-b101-signed-http.mjs');
  const testNames = [...suite.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
  const initial = {
    expectedSha,
    currentSha: gitHead(),
    gitPorcelain: worktree(),
    nodeVersion: process.versions.node,
    pnpmVersion,
    studyProgressEnabled: process.env.STUDY_PROGRESS_ENABLED,
    testNames,
  };
  assertB118ProofPreconditions(initial);
  const inventorySha256 = digest(suite);
  const runnerSha256 = digest(runner);

  // Run the complete original signed 61-case TCP acceptance, not a filtered
  // --test-name-pattern or a synthetic TAP transcription.
  const run = spawnSync(process.execPath, [
    fileURLToPath(new URL('./run-account-export-b101-signed-http.mjs', import.meta.url)),
  ], {
    cwd: root, encoding: 'utf8', timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, STUDY_PROGRESS_ENABLED: 'false' },
    windowsHide: true,
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) throw run.error;

  assertB118SignedHttpResult({
    exitCode: run.status,
    signal: run.signal,
    stdout: run.stdout,
  });

  // A clean initial checkout is not enough if another process modified the
  // tests or runner during acceptance. Never attest the wrong source.
  const finalState = {
    ...initial,
    currentSha: gitHead(),
    gitPorcelain: worktree(),
  };
  assertB118ProofPreconditions(finalState);
  if (digest(read('scripts/test-account-export-b86-s3-loopback.test.mjs')) !== inventorySha256 ||
      digest(read('scripts/run-account-export-b101-signed-http.mjs')) !== runnerSha256) {
    throw new Error('B118 signed test or runner source changed during execution');
  }

  const proof = buildB118ProofRecord({
    ...finalState, exitCode: run.status, signal: run.signal,
    stdout: run.stdout, inventorySha256, runnerSha256,
    tapSha256: digest(run.stdout),
  });
  const outputDir = mkdtempSync(join(tmpdir(), 'losapuntes-b118-proof-'));
  const outputFile = join(outputDir, 'signed-http-evidence.json');
  writeFileSync(outputFile, JSON.stringify({
    ...proof, measuredAt: new Date().toISOString(),
  }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log('B118 local Node24 signed HTTP proof: 61/61 PASS');
  console.log('B118 local evidence file: ' + outputFile);
  console.log('B118 release status: HOLD; external provider/Mongo/browser/audit acceptance still missing');
} catch (error) {
  console.error('B118 proof NOT certified: ' +
    (error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
}
