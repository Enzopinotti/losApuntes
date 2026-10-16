import assert from 'node:assert/strict';
import test from 'node:test';
import {
  integrationMarkdown,
  normalizedConflicts,
  requireSha,
} from './quality-cross-agent-rehearsal.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);

test('requires full exact 40-character commit SHA', () => {
  assert.equal(requireSha(a, 'base'), a);
  for (const input of [null, '', 'main', '../main', 'F'.repeat(40), 'a'.repeat(39)]) {
    assert.throws(() => requireSha(input, 'base'));
  }
});

test('normalizes conflict paths deterministically and deduplicates them', () => {
  assert.deepEqual(
    normalizedConflicts('api/a.ts\n\n api/b.ts \napi/a.ts\n'),
    ['api/a.ts', 'api/b.ts'],
  );
});

test('reports both merge orders and explicit conflicted files', () => {
  const report = integrationMarkdown({
    shas: { base: a, b77: b, b78: c },
    results: [
      {
        order: ['b78', 'b77'],
        ok: false,
        failedOn: 'b78',
        conflicts: ['apps/api/src/a.ts', 'apps/web/src/b.ts'],
        tree: null,
      },
      {
        order: ['b77', 'b78'],
        ok: true,
        conflicts: [],
        tree: a,
      },
    ],
    ok: false,
    commit: '',
  });
  assert.match(report, /CONFLICT applying b78/u);
  assert.match(report, /apps\/api\/src\/a\.ts/u);
  assert.match(report, /apps\/web\/src\/b\.ts/u);
  assert.match(report, /HOLD/u);
  assert.doesNotMatch(report, /Run follow-up gates on THIS/u);
});

test('successful report binds both orders to the same synthetic tree and commit', () => {
  const result = {
    order: ['b78', 'b77'],
    ok: true,
    conflicts: [],
    tree: c,
  };
  const report = integrationMarkdown({
    shas: { base: a, b77: b, b78: c },
    results: [result, { ...result, order: ['b77', 'b78'] }],
    ok: true,
    commit: b,
  });
  assert.match(report, /Both orders produced the same tree/u);
  assert.match(report, /Local-only candidate commit/u);
  assert.match(report, new RegExp(b, 'u'));
  assert.match(report, /no branch was pushed/u);
});

test('merge error with no conflict path still refuses to claim readiness', () => {
  const report = integrationMarkdown({
    shas: { base: a, b77: b, b78: c },
    results: [{ order: ['b77', 'b78'], ok: false, failedOn: 'b77', conflicts: [], tree: null }],
    ok: false,
    commit: '',
  });
  assert.match(report, /MERGE ERROR applying b77/u);
  assert.match(report, /Inspect the job log/u);
  assert.match(report, /HOLD/u);
});
