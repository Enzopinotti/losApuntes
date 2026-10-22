import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HEX_SHA = /^[0-9a-f]{40}$/u;
const INPUTS = Object.freeze({
  base: 'refs/remotes/origin/main',
  b77: 'refs/remotes/origin/ci-r01-b77',
  b78: 'refs/remotes/origin/ci-r01-b78',
});

export function requireSha(value, name) {
  assert.match(value ?? '', HEX_SHA, `${name} must be an exact commit SHA`);
  return value;
}

export function normalizedConflicts(lines) {
  return [...new Set(lines.split('\n').map((line) => line.trim())
    .filter((line) => line.length > 0))].sort();
}

export function integrationMarkdown(input) {
  const rows = [
    '# CI-R01 — Read-only cross-agent merge rehearsal',
    '',
    `**main**: \`${input.shas.base}\``,
    `**B77 #374**: \`${input.shas.b77}\``,
    `**B78 #377**: \`${input.shas.b78}\``,
    '',
    '| Merge order | Result | Synthetic tree |',
    '| --- | --- | --- |',
  ];
  for (const result of input.results) {
    const status = result.ok
      ? 'Merge clean'
      : result.conflicts.length
        ? `CONFLICT applying ${result.failedOn ?? 'unknown'}`
        : `MERGE ERROR applying ${result.failedOn ?? 'unknown'}`;
    rows.push(`| ${result.order.join(' → ')} | ${status} | ${result.tree ?? '—'} |`);
    if (!result.ok) {
      rows.push('', `Conflict details for **${result.order.join(' → ')}**:`);
      if (result.conflicts.length) {
        for (const conflict of result.conflicts) {
          rows.push(`- \`${conflict}\``);
        }
      } else {
        rows.push('- Merge failed without a path-level conflict. Inspect the job log.');
      }
      rows.push('');
    }
  }
  if (input.ok) {
    rows.push(
      '',
      `Both orders produced the same tree: \`${input.results[0].tree}\`.`,
      `Local-only candidate commit: \`${input.commit}\`.`,
      'Run follow-up gates on THIS synthetic commit; no branch was pushed.',
    );
  } else {
    rows.push(
      '',
      '**HOLD:** do not merge either stale carrier by copying complete source files.',
      'Reconcile the listed conflicts semantically, reformat with the pinned toolchain and rerun all gates.',
    );
  }
  rows.push(
    '',
    'This is an integration preflight only. It does not approve production, waive security audits or merge any PR.',
  );
  return rows.join('\n') + '\n';
}

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function checkedGit(args) {
  const result = git(args);
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr?.slice(-1200)}`);
  }
  return result.stdout.trim();
}

function localMerge(ref, label) {
  return git([
    '-c', 'user.name=CI-R01 Rehearsal',
    '-c', 'user.email=ci-r01@example.invalid',
    'merge', '--no-ff', '--no-edit', '--no-gpg-sign',
    '-m', `CI-R01 temporary merge of ${label} (do not push)`,
    ref,
  ]);
}

function conflictPaths() {
  const result = git(['diff', '--name-only', '--diff-filter=U']);
  return normalizedConflicts(result.stdout ?? '');
}

function resetBase(base) {
  checkedGit(['switch', '--detach', '--force', base]);
}

function tryOrder(shas, order) {
  resetBase(shas.base);
  for (const label of order) {
    const merged = localMerge(shas[label], label);
    if (merged.status !== 0) {
      const conflicts = conflictPaths();
      const report = { order, ok: false, failedOn: label, conflicts, tree: null };
      const aborted = git(['merge', '--abort']);
      if (aborted.status !== 0) {
        throw new Error('Unable to abort a synthetic merge. Stop immediately.');
      }
      return report;
    }
  }
  return {
    order,
    ok: true,
    conflicts: [],
    tree: checkedGit(['rev-parse', 'HEAD^{tree}']),
    commit: checkedGit(['rev-parse', 'HEAD']),
  };
}

export function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.CI_R01_READONLY_REHEARSAL !== 'confirmed') {
    throw new Error('Only run in the temporary read-only GitHub Actions rehearsal job.');
  }
  const clean = checkedGit(['status', '--porcelain', '--untracked-files=no']);
  assert.equal(clean, '', 'Rehearsal requires a clean checkout');

  const shas = {};
  for (const [key, ref] of Object.entries(INPUTS)) {
    const actual = requireSha(checkedGit(['rev-parse', ref]), key);
    const expected = requireSha(process.env[`CI_R01_${key.toUpperCase()}_SHA`], key);
    assert.equal(actual, expected, `${key} moved between fetch and rehearsal`);
    shas[key] = actual;
  }
  const results = [
    tryOrder(shas, ['b78', 'b77']),
    tryOrder(shas, ['b77', 'b78']),
  ];
  const sameTree = results.every((result) => result.ok) &&
    results[0].tree === results[1].tree;
  const selected = results[0];
  const report = integrationMarkdown({
    shas,
    results,
    ok: sameTree,
    commit: selected.commit ?? '',
  });
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }
  if (!sameTree) {
    process.exitCode = 1;
    return;
  }
  // Keep the first synthetic order checked out for the following CI tests.
  resetBase(selected.commit);
  assert.equal(checkedGit(['rev-parse', 'HEAD^{tree}']), selected.tree);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
