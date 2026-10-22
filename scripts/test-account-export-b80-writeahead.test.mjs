import assert from 'node:assert/strict';
import test from 'node:test';

import { planAccountExportClaimWriteAhead } from '../apps/api/src/data-lifecycle/domain/account-export-claim-writeahead.ts';

const now = new Date('2026-10-16T12:00:00.000Z');
const start = {
  jobId: '11111111-1111-4111-8111-111111111111',
  ownerUserId: 'private-owner',
  generation: '22222222-2222-4222-8222-222222222222',
  now,
  leaseExpiresAt: new Date(now.getTime() + 120_000),
  leaseDurationMs: 120_000,
};

test('B80 new claim persists exact owner and immutable generation in pending ledger', () => {
  const row = planAccountExportClaimWriteAhead(start);
  assert.deepEqual({
    jobId: row.jobId,
    ownerUserId: row.ownerUserId,
    generation: row.generation,
    state: row.state,
    attempts: row.attempts,
    claimId: row.claimId,
    leaseExpiresAt: row.leaseExpiresAt,
  }, {
    jobId: start.jobId,
    ownerUserId: start.ownerUserId,
    generation: start.generation,
    state: 'pending',
    attempts: 0,
    claimId: null,
    leaseExpiresAt: null,
  });
});

test('B80 first due date is three leases after the original lease expires', () => {
  const row = planAccountExportClaimWriteAhead(start);
  assert.equal(row.nextAttemptAt.getTime(), now.getTime() + 4 * 120_000);
  assert.equal(row.verificationUntil.getTime(),
    now.getTime() + 4 * 120_000 + 60 * 60_000);
});

test('B80 honors longer lease and never schedules deletion before it expires', () => {
  const longLease = new Date(now.getTime() + 30 * 60_000);
  const row = planAccountExportClaimWriteAhead({
    ...start, leaseExpiresAt: longLease,
  });
  assert.ok(row.nextAttemptAt.getTime() > longLease.getTime());
  assert.ok(row.verificationUntil.getTime() > row.nextAttemptAt.getTime());
});

test('B80 distinct attempt generations derive distinct durable queue identities', () => {
  const older = planAccountExportClaimWriteAhead(start);
  const newer = planAccountExportClaimWriteAhead({
    ...start,
    generation: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(older.jobId, newer.jobId);
  assert.notEqual(older.generation, newer.generation);
  assert.equal(older.ownerUserId, newer.ownerUserId);
});

test('B80 invalid durations, missing owner, stale lease and impossible dates fail closed', () => {
  const invalid = [
    { ...start, ownerUserId: '' },
    { ...start, generation: '' },
    { ...start, leaseDurationMs: 0 },
    { ...start, leaseDurationMs: Number.POSITIVE_INFINITY },
    { ...start, leaseExpiresAt: now },
    { ...start, leaseExpiresAt: new Date('invalid') },
    { ...start, now: new Date('invalid') },
    { ...start, leaseExpiresAt: new Date(8.64e15), leaseDurationMs: 3600000 },
  ];
  for (const candidate of invalid) {
    assert.throws(() => planAccountExportClaimWriteAhead(candidate), /invalid/u);
  }
});
