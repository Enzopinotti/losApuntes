import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accountExportLeaseActiveOnMongoServer,
  accountExportLeaseExpiredOnMongoServer,
} from '../apps/api/src/data-lifecycle/domain/account-export-mongo-lease-clock.ts';

test('B83 active-lease predicate requires Mongo $$NOW, never client completedAt', () => {
  assert.deepEqual(accountExportLeaseActiveOnMongoServer(), {
    $expr: { $gt: ['$leaseExpiresAt', '$$NOW'] },
  });
});

test('B83 expired-lease predicate requires Mongo $$NOW for revocation', () => {
  assert.deepEqual(accountExportLeaseExpiredOnMongoServer(), {
    $expr: { $lte: ['$leaseExpiresAt', '$$NOW'] },
  });
});

test('B83 predicates are deterministic and share no mutable date or metadata', () => {
  const first = accountExportLeaseActiveOnMongoServer();
  const second = accountExportLeaseActiveOnMongoServer();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes('completedAt'), false);
  assert.equal(JSON.stringify(second).includes('Date'), false);
});

test('B83 client-captured time cannot by itself justify a delayed completion', () => {
  const capturedAt = new Date('2026-10-16T12:00:00.000Z');
  const leaseExpiresAt = new Date('2026-10-16T12:02:00.000Z');
  const executedAtMongo = new Date('2026-10-16T12:03:00.000Z');
  // Old client-only predicate would be true. Mongo primary evaluation
  // is false; this is the exact delayed-command race being guarded.
  assert.ok(leaseExpiresAt > capturedAt);
  assert.equal(leaseExpiresAt > executedAtMongo, false);
  assert.deepEqual(accountExportLeaseActiveOnMongoServer().$expr.$gt,
    ['$leaseExpiresAt', '$$NOW']);
});

test('B83 server-side time also blocks early revocation by a clock-ahead worker', () => {
  const serverNow = new Date('2026-10-16T12:00:00.000Z');
  const leaseExpiresAt = new Date('2026-10-16T12:01:00.000Z');
  const workerNow = new Date('2026-10-16T12:04:00.000Z');
  assert.ok(leaseExpiresAt <= workerNow);
  assert.equal(leaseExpiresAt <= serverNow, false);
  assert.deepEqual(accountExportLeaseExpiredOnMongoServer().$expr.$lte,
    ['$leaseExpiresAt', '$$NOW']);
});
