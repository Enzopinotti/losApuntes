/**
 * B118: checks for a local proof, independent of shell/git/process.
 * Requiring an exact clean HEAD makes evidence tied to the tested source
 * rather than to a stale CI run, a different branch, or a dirty checkout.
 */
export function assertB118ProofPreconditions(input) {
  if (!/^[a-f0-9]{40}$/u.test(input.expectedSha ?? '') ||
      input.currentSha !== input.expectedSha) {
    throw new Error('B118 requires an exact expected 40-hex Git HEAD');
  }
  if (input.gitPorcelain !== '') {
    throw new Error('B118 requires a completely clean Git worktree');
  }
  if (!/^24\./u.test(input.nodeVersion ?? '')) {
    throw new Error('B118 signed HTTP qualification requires Node24');
  }
  if (input.pnpmVersion !== '9.15.9') {
    throw new Error('B118 requires pnpm 9.15.9');
  }
  if (input.studyProgressEnabled === 'true') {
    throw new Error('B118 refuses STUDY_PROGRESS_ENABLED=true in qualification');
  }
  const names = input.testNames;
  if (!Array.isArray(names) || names.length !== 61 ||
      new Set(names).size !== 61 ||
      names.filter(name => typeof name === 'string' && name.startsWith('B117 ')).length !== 4 ||
      names.filter(name => typeof name === 'string' && name.startsWith('B119 ')).length !== 2 ||
      names.filter(name => typeof name === 'string' && name.startsWith('B120 ')).length !== 2 ||
      names.some(name => typeof name !== 'string' || name.length === 0)) {
    throw new Error('B118 requires all 61 unique signed S3 cases');
  }
}

export function assertB118SignedHttpResult(input) {
  if (input.exitCode !== 0 || input.signal !== null ||
      typeof input.stdout !== 'string') {
    throw new Error('B118 signed HTTP subprocess failed or was interrupted');
  }
  const markers = [...input.stdout.matchAll(
    /^B107 Node24 qualified signed HTTP PASS: ([0-9]+)\/([0-9]+)$/gmu,
  )];
  if (markers.length !== 1 || markers[0][1] !== '61' || markers[0][2] !== '61') {
    throw new Error('B118 missing unique 61/61 Node24 qualified proof marker');
  }
}

export function buildB118ProofRecord(input) {
  assertB118ProofPreconditions(input);
  assertB118SignedHttpResult(input);
  const hex = /^[a-f0-9]{64}$/u;
  if (!hex.test(input.inventorySha256 ?? '') ||
      !hex.test(input.runnerSha256 ?? '') ||
      !hex.test(input.tapSha256 ?? '')) {
    throw new Error('B118 requires SHA256 provenance for inventory, runner and TAP');
  }
  return {
    schema: 'losapuntes.account-export.signed-http.b118.v1',
    gitSha: input.expectedSha,
    nodeVersion: input.nodeVersion,
    pnpmVersion: input.pnpmVersion,
    total: 61,
    passed: 61,
    skipped: 0,
    todo: 0,
    inventorySha256: input.inventorySha256,
    runnerSha256: input.runnerSha256,
    tapSha256: input.tapSha256,
    releaseGate: 'HOLD',
    studyProgressProductionEnabled: false,
  };
}
