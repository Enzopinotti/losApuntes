import assert from 'node:assert/strict';
import test from 'node:test';

import { accountExportArtifactLiveOnMongoServer } from '../apps/api/src/data-lifecycle/domain/account-export-mongo-download-clock.ts';
import { accountExportArtifactExpiredOnMongoServer } from '../apps/api/src/data-lifecycle/domain/account-export-mongo-artifact-expiry.ts';

const primaryNow = new Date('2026-10-16T14:00:00.000Z');
const past = new Date(primaryNow.getTime() - 1);
const future = new Date(primaryNow.getTime() + 60_000);
function evalExpr(value, row) {
  if (typeof value === 'string') {
    if (value === '$$NOW') return primaryNow;
    if (value.startsWith('$')) return row[value.slice(1)];
    return value;
  }
  if (Array.isArray(value)) return value.map(x => evalExpr(x, row));
  if (value && typeof value === 'object') {
    const [[op, arg]] = Object.entries(value);
    if (op === '$type') {
      const result = evalExpr(arg, row);
      return result instanceof Date ? 'date' : result === undefined ? 'missing' :
        result === null ? 'null' : typeof result;
    }
    const args = Array.isArray(arg) ? arg.map(x => evalExpr(x, row)) : [];
    if (op === '$and') return args.every(Boolean);
    if (op === '$eq') return args[0] === args[1];
    if (op === '$gt' || op === '$lte') {
      if (!(args[0] instanceof Date) || !(args[1] instanceof Date)) return false;
      return op === '$gt' ? args[0] > args[1] : args[0] <= args[1];
    }
    throw new Error('Unsupported test expression: ' + op);
  }
  return value;
}
const eligible = date => evalExpr(
  accountExportArtifactLiveOnMongoServer().$expr,
  { artifactExpiresAt: date },
);

test('B93 primary recognizes a future artifact as downloadable', () => {
  assert.equal(eligible(future), true);
});

test('B93 worker ahead by one hour must not prematurely expire a valid artifact', () => {
  const workerNow = new Date(primaryNow.getTime() + 3_600_000);
  assert.equal(future.getTime() <= workerNow.getTime(), true);
  assert.equal(eligible(future), true);
});

test('B93 worker behind by one hour must not resurrect an expired artifact', () => {
  const workerNow = new Date(primaryNow.getTime() - 3_600_000);
  assert.equal(past.getTime() > workerNow.getTime(), true);
  assert.equal(eligible(past), false);
});

test('B93 expiry exactly equal to primary NOW is not downloadable', () => {
  assert.equal(eligible(primaryNow), false);
});

test('B93 malformed, missing or non-BSON-Date expiry values fail closed', () => {
  for (const invalid of [null, undefined, 0, '', '2026-10-16T14:01:00Z', {}]) {
    assert.equal(eligible(invalid), false);
  }
});

test('B93 server read predicate is complementary to B85 retirement predicate', () => {
  for (const date of [past, primaryNow, future]) {
    const read = eligible(date);
    const retired = evalExpr(
      accountExportArtifactExpiredOnMongoServer().$expr,
      { artifactExpiresAt: date },
    );
    assert.equal(read && retired, false);
    assert.equal(read || retired, true);
  }
});

test('B93 query uses server NOW and a strict greater-than expression', () => {
  assert.deepEqual(accountExportArtifactLiveOnMongoServer(), {
    $expr: { $and: [
      { $eq: [{ $type: '$artifactExpiresAt' }, 'date'] },
      { $gt: ['$artifactExpiresAt', '$$NOW'] },
    ] },
  });
});

test('B93 no worker now or local Date.now participates in Mongo eligibility', () => {
  const expr = JSON.stringify(accountExportArtifactLiveOnMongoServer());
  assert.ok(expr.includes('$$NOW'));
  assert.equal(expr.includes('input.now'), false);
  assert.equal(expr.includes('Date.now'), false);
});

test('B93 predicate is fresh each time and does not mutate eligibility state', () => {
  const a = accountExportArtifactLiveOnMongoServer();
  const b = accountExportArtifactLiveOnMongoServer();
  assert.notStrictEqual(a, b);
  assert.deepEqual(a, b);
});
