import assert from 'node:assert/strict';
import test from 'node:test';
import { accountExportArtifactExpiredOnMongoServer } from '../apps/api/src/data-lifecycle/domain/account-export-mongo-artifact-expiry.ts';

const expr = accountExportArtifactExpiredOnMongoServer().$expr;
const primaryNow = new Date('2026-10-16T14:00:00.000Z');
const before = new Date(primaryNow.getTime() - 1);
const after = new Date(primaryNow.getTime() + 60_000);

function evaluate(value, row) {
  if (typeof value === 'string') {
    if (value === '$$NOW') return primaryNow;
    if (value.startsWith('$')) return row[value.slice(1)];
    return value;
  }
  if (Array.isArray(value)) return value.map(v => evaluate(v, row));
  if (value !== null && typeof value === 'object') {
    const [[op, arg]] = Object.entries(value);
    if (op === '$type') {
      const v = evaluate(arg, row);
      return v instanceof Date ? 'date' : v === undefined ? 'missing' :
        v === null ? 'null' : typeof v;
    }
    const args = Array.isArray(arg) ? arg.map(v => evaluate(v, row)) : [];
    if (op === '$eq') return args[0] === args[1];
    if (op === '$lte') return args[0] instanceof Date &&
      args[1] instanceof Date && args[0].getTime() <= args[1].getTime();
    if (op === '$and') return args.every(Boolean);
    throw new Error('Unexpected Mongo expression ' + op);
  }
  return value;
}
const due = artifactExpiresAt => evaluate(expr, { artifactExpiresAt });

test('B85 expression uses a real BSON Date and the Mongo primary clock', () => {
  assert.deepEqual(accountExportArtifactExpiredOnMongoServer(), {
    $expr: { $and: [
      { $eq: [{ $type: '$artifactExpiresAt' }, 'date'] },
      { $lte: ['$artifactExpiresAt', '$$NOW'] },
    ] },
  });
});

test('B85 a worker clock ahead cannot mark an unexpired object due', () => {
  const workerNow = new Date(after.getTime() + 3_600_000);
  assert.ok(after.getTime() < workerNow.getTime());
  assert.equal(due(after), false);
});

test('B85 an actually expired or exactly due object may retire', () => {
  assert.equal(due(before), true);
  assert.equal(due(primaryNow), true);
});

test('B85 invalid/null/missing expiry metadata always fails closed', () => {
  for (const value of [undefined, null, '', 0, '2026-10-16T12:00:00Z', {}]) {
    assert.equal(due(value), false);
  }
});

test('B85 expression does not embed a worker timestamp or mutable state', () => {
  const one = accountExportArtifactExpiredOnMongoServer();
  const two = accountExportArtifactExpiredOnMongoServer();
  assert.notStrictEqual(one, two);
  assert.deepEqual(one, two);
  assert.ok(JSON.stringify(one).includes('$$NOW'));
  assert.equal(JSON.stringify(one).includes('input.now'), false);
});
