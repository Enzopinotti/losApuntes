import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accountExportJobClaimDueOnMongoServer,
  accountExportOrphanClaimDueOnMongoServer,
  accountExportOrphanOwnedAndDueOnMongoServer,
} from '../apps/api/src/data-lifecycle/domain/account-export-mongo-claim-clock.ts';

const primary = new Date('2026-10-16T14:00:00.000Z');
const before = new Date(primary.getTime() - 1_000);
const after = new Date(primary.getTime() + 60_000);

// Independent interpreter of the small expression subset used by the
// new guards. This tests the real helper's serialized Mongo expression,
// NOT an actual MongoDB server (the opt-in replica suite covers that).
function evaluate(node, row, serverTime) {
  if (typeof node === 'string') {
    if (node === '$$NOW') return serverTime;
    if (node.startsWith('$')) return row[node.slice(1)];
    return node;
  }
  if (Array.isArray(node)) return node.map(x => evaluate(x, row, serverTime));
  if (node !== null && typeof node === 'object') {
    const [[op, operand]] = Object.entries(node);
    const args = Array.isArray(operand)
      ? operand.map(x => evaluate(x, row, serverTime))
      : undefined;
    switch (op) {
      case '$type': {
        const value = evaluate(operand, row, serverTime);
        return value instanceof Date ? 'date' : value === undefined ? 'missing' :
          value === null ? 'null' : typeof value;
      }
      case '$eq':
        return args[0] instanceof Date && args[1] instanceof Date
          ? args[0].getTime() === args[1].getTime()
          : args[0] === args[1];
      case '$lte':
        return args[0] instanceof Date && args[1] instanceof Date &&
          args[0].getTime() <= args[1].getTime();
      case '$gt':
        return args[0] instanceof Date && args[1] instanceof Date &&
          args[0].getTime() > args[1].getTime();
      case '$and':
        return args.every(Boolean);
      case '$or':
        return args.some(Boolean);
      default:
        throw new Error('Unexpected expression operator ' + op);
    }
  }
  return node;
}
function eligible(helper, row, now = primary) {
  return evaluate(helper().$expr, row, now);
}

test('B84 job: future pending cannot be claimed by a worker clock ahead', () => {
  assert.equal(eligible(accountExportJobClaimDueOnMongoServer, {
    state: 'pending', nextAttemptAt: after,
  }), false);
  assert.equal(eligible(accountExportJobClaimDueOnMongoServer, {
    state: 'pending', nextAttemptAt: before,
  }), true);
});

test('B84 job: processing takeover needs expiration at the primary', () => {
  assert.equal(eligible(accountExportJobClaimDueOnMongoServer, {
    state: 'processing', leaseExpiresAt: after,
  }), false);
  assert.equal(eligible(accountExportJobClaimDueOnMongoServer, {
    state: 'processing', leaseExpiresAt: before,
  }), true);
});

test('B84 job: corrupt pending or processing deadlines cannot authorize claims', () => {
  for (const row of [
    { state: 'pending', nextAttemptAt: null },
    { state: 'pending', nextAttemptAt: '2026-10-16T13:59:59Z' },
    { state: 'processing', leaseExpiresAt: undefined },
    { state: 'processing', leaseExpiresAt: null },
    { state: 'failed', nextAttemptAt: before, leaseExpiresAt: before },
  ]) assert.equal(eligible(accountExportJobClaimDueOnMongoServer, row), false);
});

test('B84 orphan: fresh first-generation recovery cannot run before Mongo due date', () => {
  assert.equal(eligible(accountExportOrphanClaimDueOnMongoServer, {
    state: 'pending', nextAttemptAt: after, leaseExpiresAt: null,
  }), false);
  assert.equal(eligible(accountExportOrphanClaimDueOnMongoServer, {
    state: 'pending', nextAttemptAt: before, leaseExpiresAt: null,
  }), true);
});

test('B84 orphan: reclaim of old cleanup lease also needs settling due date', () => {
  const row = { state: 'processing', nextAttemptAt: after, leaseExpiresAt: before };
  assert.equal(eligible(accountExportOrphanClaimDueOnMongoServer, row), false);
  assert.equal(eligible(accountExportOrphanClaimDueOnMongoServer, {
    ...row, nextAttemptAt: before,
  }), true);
  assert.equal(eligible(accountExportOrphanClaimDueOnMongoServer, {
    ...row, nextAttemptAt: before, leaseExpiresAt: after,
  }), false);
});

test('B84 orphan: processing with missing/invalid lease cannot be reclaimed', () => {
  for (const lease of [null, undefined, '2026-10-16T13:00:00Z']) {
    assert.equal(eligible(accountExportOrphanClaimDueOnMongoServer, {
      state: 'processing', leaseExpiresAt: lease, nextAttemptAt: before,
    }), false);
  }
});

test('B84 cleanup owner: renewal and ACK require live server lease and due time', () => {
  assert.equal(eligible(accountExportOrphanOwnedAndDueOnMongoServer, {
    state: 'processing', leaseExpiresAt: after, nextAttemptAt: before,
  }), true);
  assert.equal(eligible(accountExportOrphanOwnedAndDueOnMongoServer, {
    state: 'processing', leaseExpiresAt: before, nextAttemptAt: before,
  }), false);
  assert.equal(eligible(accountExportOrphanOwnedAndDueOnMongoServer, {
    state: 'processing', leaseExpiresAt: after, nextAttemptAt: after,
  }), false);
});

test('B84 cleanup owner: corrupt dates never grant S3 deletion authority', () => {
  const f = accountExportOrphanOwnedAndDueOnMongoServer;
  for (const row of [
    { leaseExpiresAt: null, nextAttemptAt: before },
    { leaseExpiresAt: after, nextAttemptAt: null },
    { leaseExpiresAt: 'future', nextAttemptAt: before },
    { leaseExpiresAt: after, nextAttemptAt: 'past' },
  ]) assert.equal(eligible(f, row), false);
});

test('B84 original client time is never serialized as an authority', () => {
  for (const helper of [
    accountExportJobClaimDueOnMongoServer,
    accountExportOrphanClaimDueOnMongoServer,
    accountExportOrphanOwnedAndDueOnMongoServer,
  ]) {
    const encoded = JSON.stringify(helper());
    assert.ok(encoded.includes('$$NOW'));
    assert.equal(encoded.includes('input.now'), false);
    assert.equal(encoded.includes('Date.now'), false);
    assert.ok(encoded.includes('$type'));
  }
});
